import { config } from "./config.js";
import { pick } from "./utils.js";

const WATCH_TERMS = [
  "slammed",
  "cooked",
  "fried",
  "beamed",
  "wiped",
  "rolled",
  "smoked",
  "deleted",
  "clip it",
  "clipped"
];

const HYPE_REPLIES = {
  slammed: [
    "chat verdict: SLAMMED 😭",
    "mrnutt3r confirms it... that was slammed behavior",
    "yeah chat got this one right — absolutely slammed"
  ],
  cooked: [
    "chat says COOKED and honestly... yeah 😭",
    "that man got cooked on all burners",
    "fully cooked, no seasoning needed"
  ],
  fried: [
    "fried. extra crispy.",
    "chat screaming FRIED and I can't even argue",
    "that was a public frying"
  ],
  beamed: [
    "beamed out of existence 😤",
    "chat saw the beam and so did I",
    "that aim just sent a message"
  ],
  wiped: [
    "wiped. whole situation gone.",
    "chat says WIPED and that's facts",
    "clean wipe, filthy work"
  ],
  rolled: [
    "rolled up and packed out 😭",
    "chat got the call right — rolled",
    "that was a rolling, respectfully"
  ],
  smoked: [
    "smoked. no debate.",
    "chat says SMOKED and I fear they're correct",
    "that was secondhand smoke for the whole lobby"
  ],
  deleted: [
    "deleted from the timeline 😭",
    "chat says deleted and the footage agrees",
    "that health bar got erased"
  ],
  "clip it": [
    "chat wants the clip and I do too 🎬",
    "CLIP IT. immediately.",
    "yeah that's clip-worthy, no question"
  ],
  clipped: [
    "clipped. stamp it.",
    "chat screaming clipped — valid.",
    "that one belongs in the montage"
  ]
};

let recent = [];
let lastTriggerAt = 0;

function normalizeMessage(msg) {
  return String(msg || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function matchedTerms(message) {
  const msg = normalizeMessage(message);
  return WATCH_TERMS.filter(term => msg.includes(term));
}

export function registerChatMomentum(username, message) {
  if (!config.chatMomentumEnabled) return null;
  const now = Date.now();
  recent = recent.filter(item => now - item.at <= config.chatMomentumWindowMs);

  const terms = matchedTerms(message);
  if (!terms.length) return null;

  for (const term of terms) {
    recent.push({
      at: now,
      username: String(username || "").toLowerCase(),
      term
    });
  }

  if (now - lastTriggerAt < config.chatMomentumCooldownMs) return null;

  for (const term of terms) {
    const users = new Set(
      recent
        .filter(item => item.term == term)
        .map(item => item.username)
    );

    if (users.size >= config.chatMomentumMinUniqueUsers) {
      lastTriggerAt = now;
      recent = recent.filter(item => item.term != term);
      const lines = HYPE_REPLIES[term] || [`chat has spoken: ${term}`];
      return {
        term,
        uniqueUsers: users.size,
        reply: pick(lines)
      };
    }
  }

  return null;
}
