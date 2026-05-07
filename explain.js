import { config } from "./config.js";
import { getRuntimeConfig } from "./runtimeConfig.js";
import { isMentioned } from "./reply.js";
import { normalize } from "./utils.js";

const ABI_HINTS = [
  "abi","arena breakout","ammo","armor","helmet","gun","weapon","loadout","raid","extract","koen",
  "farm","armory","tv station","valley","northridge","airport","port","boss","covert ops","tactical ops",
  "m4","akm","mp5","vector","fal","m995","m855","ps","bp","ap","tier","class"
];

export function detectIntent(message) {
  const msg = normalize(message);
  if (msg.includes("should i push") || msg.includes("shouldipush") || msg.includes("push") || msg.includes("fight")) {
    return { intent: "shouldipush", confidence: 0.86 };
  }
  if (msg.includes("ratekit") || msg.includes("rate kit") || msg.includes("is this good") || msg.includes("good vs")) {
    return { intent: "ratekit", confidence: 0.80 };
  }
  if (msg.includes(" vs ") || msg.includes("versus") || msg.includes("compare")) {
    return { intent: "compare", confidence: 0.82 };
  }
  if (msg.includes("meta")) {
    return { intent: "meta", confidence: 0.83 };
  }
  if (msg.includes("best") || msg.includes("loadout")) {
    return { intent: "loadout", confidence: 0.72 };
  }
  if (msg.includes("worth")) {
    return { intent: "worth", confidence: 0.72 };
  }
  return { intent: null, confidence: 0 };
}

export function isAbiRelated(message) {
  const msg = normalize(message);
  return ABI_HINTS.some((h) => msg.includes(h));
}

export function shouldNaturalReply({ message, user }) {
  if (isMentioned(message)) return true;
  if (config.threadingEnabled && Date.now() <= (user?.thread?.expiresAt || 0)) return true;

  const { intent, confidence } = detectIntent(message);
  if (!intent) return false;
  if (!isAbiRelated(message)) return false;
  const minConfidence = Number(getRuntimeConfig().confidenceMin || process.env.INTENT_REPLY_MIN_CONFIDENCE || 0.72);
  if (confidence < minConfidence) return false;
  const chance = Number(getRuntimeConfig().naturalIntentChance || process.env.NATURAL_INTENT_CHANCE || 0.20);
  return Math.random() < chance;
}

export function buildIntentCommand(message) {
  const { intent } = detectIntent(message);
  if (!intent) return null;
  return { command: intent, rawArgs: message, args: message.split(/\s+/) };
}
