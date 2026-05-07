const bannedPatterns = [
  /\bpolitic(s|al)?\b/i,
  /\belection(s)?\b/i,
  /\bpresident\b/i,
  /\bcongress\b/i,
  /\bsenate\b/i,
  /\bgovernment\b/i,
  /\bwar\b/i,
  /\breligion\b/i,
  /\bjesus\b/i,
  /\ballah\b/i,
  /\bchurch\b/i,
  /\bmosque\b/i,
  /\brace\b/i,
  /\bracist\b/i,
  /\bracism\b/i,
  /\bnazi\b/i,
  /\bsex\b/i,
  /\bnsfw\b/i,
  /\bporn\b/i,
  /\bnude\b/i,
  /\bterror(ism|ist)?\b/i,
  /\bgenocide\b/i,
  /\bsuicide\b/i,
  /\bself[- ]?harm\b/i
];

const safeFallbacks = [
  "we keeping it ABI-only in here 😤",
  "wrong lobby for that topic — ask me about Arena Breakout Infinite 👀",
  "nah, I’m sticking to game talk and light chat 💀",
  "not touching that one — hit me with an ABI question instead"
];

const gameHints = [
  "arena breakout",
  "abi",
  "ammo",
  "armor",
  "helmet",
  "gun",
  "weapon",
  "loadout",
  "raid",
  "extract",
  "koen",
  "farm",
  "armory",
  "tv station",
  "valley",
  "northridge",
  "airport",
  "port",
  "boss",
  "covert ops",
  "tactical ops"
];

export function isUnsafe(message) {
  const msg = String(message || "");
  return bannedPatterns.some((pattern) => pattern.test(msg));
}

export function isProbablyGameRelated(message) {
  const msg = String(message || "").toLowerCase();
  return gameHints.some((hint) => msg.includes(hint));
}

export function getSafeRedirect() {
  return safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
}
