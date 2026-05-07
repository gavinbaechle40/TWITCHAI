import { askAI } from "./ai.js";
import { addMemory, ensureUser, getState, queueSave } from "./state.js";
import { pick } from "./utils.js";
import { autofillContextFromMessage, computeConfidence } from "./intelligence.js";
import { isMentioned } from "./reply.js";
import { config } from "./config.js";

function clearExpiredThreadContext(user) {
  const expiresAt = user.thread?.expiresAt || 0;
  if (Date.now() <= expiresAt) return;

  user.thread.weapon = null;
  user.thread.ammo = null;
  user.thread.enemyTier = null;
  user.thread.map = null;
  user.thread.intent = null;
}

export async function handleConversationalMessage({ tags, message }) {
  const username = tags.username;
  const user = ensureUser(username);
  const s = getState();

  const lower = String(message || "").toLowerCase();
  const mentioned = isMentioned(message);
  const isFollowUp =
    config.threadingEnabled && Date.now() <= (user.thread?.expiresAt || 0);

  clearExpiredThreadContext(user);

  if (
    lower.includes("how are you") ||
    lower.includes("howdy") ||
    lower.includes("hello") ||
    lower.includes("hi")
  ) {
    return {
      text: pick([
        "living my best bot life 😤",
        "better than your last push 😭",
        "running smooth... unlike that recoil control",
        "locked in and judging your next raid 👀"
      ]),
      confidence: 0.99,
      source: "smalltalk"
    };
  }

  // Only pull detailed combat context when the message is clearly part of a thread
  // or the bot is directly mentioned. Otherwise keep context minimal to avoid stale carryover.
  const ctx =
    mentioned || isFollowUp
      ? autofillContextFromMessage(username, message)
      : {
          map: s.shared.currentMap || null,
          kit: s.shared.currentKit || null,
          weapon: null,
          ammo: null,
          enemyTier: null
        };

  user.thread.lastQuestionAt = Date.now();
  user.thread.expiresAt =
    Date.now() + Number(process.env.THREADING_WINDOW_MS || 90000);
  queueSave();

  const mem = getState().memory.perUser[username] || [];
  const context = [
    `sharedMap=${s.shared.currentMap || "none"}`,
    `sharedKit=${s.shared.currentKit || "none"}`,
    `userMap=${ctx.map || "none"}`,
    `userKit=${ctx.kit || "none"}`,
    `weapon=${ctx.weapon || "unknown"}`,
    `ammo=${ctx.ammo || "unknown"}`,
    `enemyTier=${ctx.enemyTier || "unknown"}`,
    `recent=${mem.slice(-2).map(x => x.question).join(" | ")}`
  ].join(", ");

  const ai = await askAI({
    question: message,
    context,
    personality: s.shared.personality || "funny"
  });

  if (ai) {
    addMemory(username, { question: message, answer: ai, at: Date.now() });
    user.thread.lastAnswer = ai;
    queueSave();

    return {
      text: ai,
      confidence: computeConfidence({
        aiUsed: true,
        mention: mentioned,
        followUp: isFollowUp,
        intentConfidence: 0.7
      }),
      source: "ai-thread"
    };
  }

  return null;
}