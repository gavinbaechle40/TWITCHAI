import "dotenv/config";
import tmi from "tmi.js";

import { config } from "./config.js";
import { TTLCache } from "./cache.js";
import { loadDb } from "./db.js";
import { loadState, backupState, ensureUser, queueSave, getState } from "./state.js";
import { parseSimpleCommand } from "./parsing.js";
import { say, isMentioned } from "./reply.js";
import { handleCommand } from "./commands.js";
import { handleConversationalMessage } from "./chat.js";
import { initEvents, pollEvents } from "./events.js";
import { buildMetaCache } from "./metaCache.js";
import {
  detectIntent,
  shouldRespondToNaturalChat,
  autofillContextFromMessage,
  buildIntentRawArgs,
} from "./intelligence.js";
import { maybeEmitInsight } from "./insights.js";
import { logger } from "./logger.js";
import { validateStartup } from "./validate.js";
import { loadRuntimeConfig } from "./runtimeConfig.js";
import { writeHeartbeat } from "./heartbeat.js";
import { registerChatMomentum } from "./chatMomentum.js";
import { isUnsafe, getSafeRedirect } from "./safety.js";
import { getGameInsight } from "./gameData.js";
import { handleKoenCommand, processJackpot } from "./economy.js";



const validation = validateStartup();
validation.warnings.forEach(w => logger.warn(w));
if (!validation.ok) {
  validation.errors.forEach(e => logger.error(e));
  process.exit(1);
}
loadRuntimeConfig();
loadDb();
buildMetaCache();
loadState();
initEvents();
logger.info("mrnutt3r startup complete");

const responseCache = new TTLCache(config.responseCacheTtlMs);

setInterval(() => backupState(), config.stateBackupIntervalMs);
setInterval(() => writeHeartbeat({ channel: process.env.TWITCH_CHANNEL }), config.heartbeatIntervalMs);

const client = new tmi.Client({
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_OAUTH
  },
  channels: [process.env.TWITCH_CHANNEL]
});

function isModOrBroadcaster(tags) {
  return Boolean(tags?.mod || tags?.badges?.broadcaster === "1");
}

function normalizeReply(reply) {
  if (!reply) return null;
  if (typeof reply === "string") return { text: reply, confidence: 0.8, source: "direct" };
  return reply;
}

client.connect().then(() => logger.info("Connected to Twitch chat")).catch(err => logger.error("Twitch connect failed", { error: String(err) }));

setInterval(() => pollEvents(client, process.env.TWITCH_CHANNEL), config.randomEventPollMs);
setInterval(() => processJackpot(client, process.env.TWITCH_CHANNEL), 5000);
setInterval(
  () => maybeEmitInsight(client, process.env.TWITCH_CHANNEL),
  Math.max(30000, config.autoInsightsIntervalMs / 3)
);

client.on("message", async (channel, tags, message, self) => {
  if (self || !tags?.username) return;

  const user = ensureUser(tags.username);
  // Koen commands run before the normal bot gate so !join works for jackpot entries.
  // Hat colors are intentionally gated behind !abi color <color> only.
  const handledKoen = await handleKoenCommand({ client, channel, tags, message, say, userState: user });
  if (handledKoen) return;

  const parsed = parseSimpleCommand(config.prefix, message);
  const mentioned = isMentioned(message);

  // Hard gate: only respond to direct bot commands or direct mentions.
  // This prevents threaded/follow-up logic from answering random chat after the bot replies.
  if (!parsed && !mentioned) {
    return;
  }

  if (isUnsafe(message)) {
    return say(client, channel, tags, message, getSafeRedirect(), user);
  }

  autofillContextFromMessage(tags.username, message);

  if (parsed) {
    const adminOnly = ["resetstats", "votereset", "toggle", "personality"];
    if (adminOnly.includes(parsed.command) && !isModOrBroadcaster(tags)) return;

    if (parsed.command === "resetstats") {
      const s = getState();
      s.stats = { raids: 0, deaths: 0, extracts: 0, wins: 0, totalProfit: 0, totalLoss: 0 };
      queueSave();
      return say(client, channel, tags, message, "stream stats reset", user);
    }

    if (parsed.command === "votereset") {
      const s = getState();
      s.votes = { push: 0, rotate: 0, extract: 0, hold: 0 };
      queueSave();
      return say(client, channel, tags, message, "votes reset", user);
    }

    if (parsed.command === "vote") {
      const s = getState();
      const choice = (parsed.args[0] || "").toLowerCase();
      if (s.votes[choice] !== undefined) {
        s.votes[choice]++;
        user.votesCast++;
        queueSave();
        return;
      }
    }

    const commandInsight = getGameInsight(`${parsed.command} ${parsed.rawArgs}`);
    if (commandInsight) {
      user.thread.lastQuestionAt = Date.now();
      user.thread.expiresAt = Date.now() + config.threadingWindowMs;
      user.thread.lastQuestion = message;
      user.thread.lastAnswer = commandInsight;
      user.thread.intent = "gameInsight";
      queueSave();
      return say(client, channel, tags, message, commandInsight, user);
    }

    const isLiveEventCommand = ["loot", "secure", "evac", "event"].includes(parsed.command);
    const cacheKey = `cmd:${parsed.command}:${parsed.rawArgs.toLowerCase()}`;
    const cached = !isLiveEventCommand ? responseCache.get(cacheKey) : null;
    if (cached) {
      return say(client, channel, tags, message, cached.text, user);
    }

    const reply = normalizeReply(await handleCommand({ command: parsed.command, rawArgs: parsed.rawArgs, args: parsed.args, tags, message }));
    if (reply?.text) {
      user.thread.lastQuestionAt = Date.now();
      user.thread.expiresAt = Date.now() + config.threadingWindowMs;
      user.thread.lastQuestion = message;
      user.thread.lastAnswer = reply.text;
      user.thread.intent = parsed.command;
      queueSave();
      if (!isLiveEventCommand) {
        responseCache.set(cacheKey, reply, config.responseCacheTtlMs);
      }
      return say(client, channel, tags, message, reply.text, user);
    }
    return;
  }

  const likelyFollowUp = false;
  const intent = detectIntent(message);

  // Mention-only natural chat. Random chat and follow-ups are blocked by the hard gate above.
  if (!shouldRespondToNaturalChat({ message, mentioned, followUp: likelyFollowUp, intent })) {
    return;
  }

  // Response priority system:
  // 1) exact response cache
  // 2) local/meta command routing from detected intent
  // 3) threaded conversational fallback
  const naturalCacheKey = `natural:${message.toLowerCase()}`;
  const naturalCached = responseCache.get(naturalCacheKey);
  if (naturalCached) {
    return say(client, channel, tags, message, naturalCached.text, user);
  }

  const gameInsight = getGameInsight(message);
  if (gameInsight) {
    user.thread.lastQuestionAt = Date.now();
    user.thread.expiresAt = Date.now() + config.threadingWindowMs;
    user.thread.lastQuestion = message;
    user.thread.lastAnswer = gameInsight;
    user.thread.intent = "gameInsight";
    queueSave();
    responseCache.set(naturalCacheKey, { text: gameInsight, confidence: 0.99, source: "gameData" }, config.responseCacheTtlMs);
    return say(client, channel, tags, message, gameInsight, user);
  }

  if (intent?.intent) {
    const rawArgs = buildIntentRawArgs(message, autofillContextFromMessage(tags.username, message));
    const routed = normalizeReply(await handleCommand({
      command: intent.intent,
      rawArgs,
      args: rawArgs.split(/\s+/).filter(Boolean),
      tags,
      message
    }));

    if (routed?.text) {
      user.thread.lastQuestionAt = Date.now();
      user.thread.expiresAt = Date.now() + config.threadingWindowMs;
      user.thread.lastQuestion = message;
      user.thread.lastAnswer = routed.text;
      user.thread.intent = intent.intent;
      queueSave();
      responseCache.set(naturalCacheKey, routed, config.responseCacheTtlMs);
      return say(client, channel, tags, message, routed.text, user);
    }
  }

  const convo = normalizeReply(await handleConversationalMessage({ tags, message }));
  if (convo?.text) {
    user.thread.lastQuestionAt = Date.now();
    user.thread.expiresAt = Date.now() + config.threadingWindowMs;
    user.thread.lastQuestion = message;
    user.thread.lastAnswer = convo.text;
    queueSave();
    responseCache.set(naturalCacheKey, convo, config.responseCacheTtlMs);
    return say(client, channel, tags, message, convo.text, user);
  }
});
