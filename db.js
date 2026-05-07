import { config } from "./config.js";

const sentCache = new Map();

export function isMentioned(message) {
  const msg = String(message || "").toLowerCase();
  return config.botAliases.some(alias => msg.includes(alias) || msg.includes(`@${alias}`));
}

export function shouldAtReply(message, userState) {
  if (isMentioned(message)) return true;
  if (!config.threadingEnabled) return false;
  return userState && Date.now() <= (userState.thread?.expiresAt || 0);
}

function clampReply(text) {
  const raw = String(text || "").trim();
  if (raw.length <= config.maxReplyChars) return raw;
  return raw.slice(0, Math.max(0, config.maxReplyChars - 1)).trimEnd() + "…";
}

function shouldSuppressDuplicate(finalMessage) {
  const now = Date.now();
  const existing = sentCache.get(finalMessage);
  sentCache.set(finalMessage, now);
  for (const [k, t] of [...sentCache.entries()]) {
    if (now - t > config.dedupeReplyWindowMs) sentCache.delete(k);
  }
  return existing && (now - existing) <= config.dedupeReplyWindowMs;
}

export function say(client, channel, tags, message, reply, userState = null) {
  const username = tags?.username || "viewer";
  const body = clampReply(reply);
  const finalMessage = shouldAtReply(message, userState) ? `@${username} ${body}` : body;

  if (shouldSuppressDuplicate(finalMessage)) return Promise.resolve(false);

  if (config.dryRun) {
    console.log(`[DRY RUN] would send: ${finalMessage}`);
    return Promise.resolve(true);
  }

  return client.say(channel, finalMessage);
}
