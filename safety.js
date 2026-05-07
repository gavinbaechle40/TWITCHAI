import { askAI } from "./ai.js";
import { addMemory, ensureUser, getState, queueSave } from "./state.js";
import { confidenceLabel } from "./explain.js";
import { pick } from "./utils.js";
import { autofillContextFromMessage, computeConfidence } from "./intelligence.js";

export async function handleConversationalMessage({ tags, message }) {
  const username = tags.username;
  const user = ensureUser(username);
  const s = getState();

  const lower = String(message || "").toLowerCase();
  const ctx = autofillContextFromMessage(username, message);

  if (lower.includes("how are you")) {
    return {
      text: pick([
        "living my best bot life 😤",
        "better than your last push 😭",
        "running smooth... unlike that recoil control"
      ]),
      confidence: 0.99,
      source: "smalltalk"
    };
  }

  user.thread.lastQuestionAt = Date.now();
  user.thread.expiresAt = Date.now() + Number(process.env.THREADING_WINDOW_MS || 90000);
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
      confidence: computeConfidence({ aiUsed: true, mention: true, followUp: true, intentConfidence: 0.7 }),
      source: "ai-thread"
    };
  }

  return null;
}
