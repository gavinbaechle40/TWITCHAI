import { config } from "./config.js";
import { getRuntimeConfig } from "./runtimeConfig.js";
import { isMentioned } from "./reply.js";
import { normalize } from "./utils.js";
import { ensureUser, getState, queueSave } from "./state.js";
import { inferTier, inferMap, canonicalize } from "./parsing.js";

const ABI_HINTS = [
  "abi", "arena breakout", "ammo", "armor", "helmet", "gun", "weapon", "loadout",
  "raid", "extract", "koen", "farm", "armory", "tv station", "valley",
  "northridge", "airport", "port", "boss", "covert ops", "tactical ops",
  "m4", "akm", "mp5", "vector", "fal", "m995", "m855", "ps", "bp", "ap",
  "tier", "class", "h416", "hk416"
];

const KNOWN_WEAPONS = [
  "m4a1", "m4", "akm", "ak", "mp5", "vector", "fal", "hk416", "svd", "mosin",
  "scar", "ump", "rpk"
];

const KNOWN_AMMO = [
  "m995", "m855", "bp", "ps", "pst", "fmj", "ap", "7.62 bp", "7.62 ps", "9mm ap"
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
  if (msg.includes("stats") || msg.includes("stat") || msg.includes("exact numbers") || msg.includes("exact number")) {
    return { intent: "lookup", confidence: 0.9 };
  }

  return { intent: null, confidence: 0 };
}

export function isAbiRelated(message) {
  const msg = normalize(message);
  return ABI_HINTS.some((h) => msg.includes(h));
}

export function computeConfidence({
  localHit = false,
  metaHit = false,
  wikiHit = false,
  aiUsed = false,
  mention = false,
  followUp = false,
  intentConfidence = 0
} = {}) {
  let score = 0.2;
  if (localHit) score += 0.32;
  if (metaHit) score += 0.22;
  if (wikiHit) score += 0.12;
  if (mention) score += 0.06;
  if (followUp) score += 0.05;
  score += Math.min(0.18, Number(intentConfidence || 0) * 0.2);
  if (aiUsed) score -= 0.04;
  return Math.max(0.15, Math.min(0.99, score));
}

function inferWeaponFromMessage(message) {
  const msg = normalize(message);
  for (const weapon of KNOWN_WEAPONS) {
    if (msg.includes(weapon)) return canonicalize(weapon);
  }
  return null;
}

function inferAmmoFromMessage(message) {
  const msg = normalize(message);
  for (const ammo of KNOWN_AMMO) {
    if (msg.includes(ammo)) return canonicalize(ammo);
  }
  return null;
}

export function autofillContextFromMessage(username, message) {
  const user = ensureUser(username);
  const state = getState();
  const thread = user.thread || {};

  const explicitMap = inferMap(message);
  const explicitTier = inferTier(message);
  const explicitWeapon = inferWeaponFromMessage(message);
  const explicitAmmo = inferAmmoFromMessage(message);
  const intent = detectIntent(message)?.intent || thread.intent || null;

  if (explicitMap) thread.map = explicitMap;
  if (explicitTier) thread.enemyTier = explicitTier;
  if (explicitWeapon) thread.weapon = explicitWeapon;
  if (explicitAmmo) thread.ammo = explicitAmmo;
  if (intent) thread.intent = intent;

  user.thread = thread;
  queueSave();

  return {
    map: explicitMap || thread.map || state.shared.currentMap || null,
    enemyTier: explicitTier || thread.enemyTier || null,
    weapon: explicitWeapon || thread.weapon || null,
    ammo: explicitAmmo || thread.ammo || null,
    kit: thread.kit || state.shared.currentKit || null,
    kitValue: state.shared.currentKitValue || 0,
    extractValue: state.shared.currentExtractValue || 0,
    intent
  };
}

export function shouldRespondToNaturalChat({ message, user, mentioned, followUp, intent }) {
  if (mentioned) return true;


  if (followUp) return true;

  const { intent: detectedIntent, confidence } = intent || detectIntent(message);

  if (!detectedIntent) return false;
  if (!isAbiRelated(message)) return false;

  const minConfidence = Number(
    process.env.INTENT_REPLY_MIN_CONFIDENCE || 0.72
  );

  if (confidence < minConfidence) return false;

  const chance = Number(
    process.env.NATURAL_INTENT_CHANCE || 0.20
  );

  return Math.random() < chance;
}

export function buildIntentRawArgs(message) {
  return String(message || "").trim();
}

export function buildIntentCommand(message) {
  const { intent } = detectIntent(message);
  if (!intent) return null;

  return {
    command: intent,
    rawArgs: buildIntentRawArgs(message),
    args: String(message || "").trim().split(/\s+/)
  };
}
