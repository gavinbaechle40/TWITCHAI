import "dotenv/config";
import tmi from "tmi.js";
import { config } from "./config.js";
import { loadDb } from "./db.js";
import { loadState, backupState, ensureUser, queueSave, getState } from "./state.js";
import { parseSimpleCommand } from "./parsing.js";
import { say, isMentioned } from "./reply.js";
import { handleCommand } from "./commands.js";
import { handleConversationalMessage } from "./chat.js";
import { isUnsafe, getSafeRedirect } from "./safety.js";
import { initEvents, pollEvents } from "./events.js";
import { buildMetaCache } from "./metaCache.js";
import { detectIntent, shouldRespondToNaturalChat, autofillContextFromMessage, buildIntentRawArgs } from "./intelligence.js";
import { TTLCache } from "./cache.js";

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
setInterval(() => maybeEmitInsight(client, process.env.TWITCH_CHANNEL), Math.max(30000, config.autoInsightsIntervalMs // 3));

client.on("message", async (channel, tags, message, self) => {
  if (self || !tags?.username) return;

  const user = ensureUser(tags.username);
  const parsed = parseSimpleCommand(config.prefix, message);

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

    const cacheKey = `cmd:${parsed.command}:${parsed.rawArgs.toLowerCase()}`;
    const cached = responseCache.get(cacheKey);
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
      responseCache.set(cacheKey, reply, config.responseCacheTtlMs);
      return say(client, channel, tags, message, reply.text, user);
    }
    return;
  }

  const mentioned = isMentioned(message);
  const likelyFollowUp = config.threadingEnabled && Date.now() <= (user.thread?.expiresAt || 0);
  const intent = detectIntent(message);

  // Smart gating: no blanket replies to normal chat
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

  if (intent?.command) {
    const rawArgs = buildIntentRawArgs(message, autofillContextFromMessage(tags.username, message));
    const routed = normalizeReply(await handleCommand({
      command: intent.command,
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
      user.thread.intent = intent.command;
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
