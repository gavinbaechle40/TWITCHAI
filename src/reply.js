import { config } from "./config.js";

const sentCache = new Map();

// Twitch chat hard limit is 500 chars. Keep a buffer for @username and safety.
const TWITCH_SAFE_MESSAGE_CHARS = Number.isFinite(Number(process.env.TWITCH_SAFE_MESSAGE_CHARS))
  ? Number(process.env.TWITCH_SAFE_MESSAGE_CHARS)
  : 430;
const CHUNK_DELAY_MS = Number.isFinite(Number(process.env.TWITCH_CHUNK_DELAY_MS))
  ? Number(process.env.TWITCH_CHUNK_DELAY_MS)
  : 650;

export function isMentioned(message) {
  const msg = String(message || "").toLowerCase();
  return config.botAliases.some(alias => msg.includes(alias) || msg.includes(`@${alias}`));
}

export function shouldAtReply(message, userState) {
  if (isMentioned(message)) return true;
  if (!config.threadingEnabled) return false;
  return userState && Date.now() <= (userState.thread?.expiresAt || 0);
}

function normalizeReplyText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitLongMessage(text, maxLen = TWITCH_SAFE_MESSAGE_CHARS) {
  const raw = normalizeReplyText(text);
  if (!raw) return [];
  if (raw.length <= maxLen) return [raw];

  const chunks = [];
  let current = "";

  // Prefer splitting on sentences first so the bot does not cut off mid-thought.
  const sentenceParts = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];

  for (const sentence of sentenceParts.map(s => s.trim()).filter(Boolean)) {
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = (current + " " + sentence).trim();
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (sentence.length <= maxLen) {
      current = sentence;
      continue;
    }

    // If one sentence is still too long, split by words.
    for (const word of sentence.split(" ")) {
      if ((current + " " + word).trim().length > maxLen) {
        if (current) chunks.push(current);
        current = word;
      } else {
        current = (current + " " + word).trim();
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function say(client, channel, tags, message, reply, userState = null) {
  const username = tags?.username || "viewer";
  const shouldMention = shouldAtReply(message, userState);
  const prefix = shouldMention ? `@${username} ` : "";

  // Reserve space for the username mention on every chunk.
  const bodyLimit = Math.max(120, TWITCH_SAFE_MESSAGE_CHARS - prefix.length);
  const chunks = splitLongMessage(reply, bodyLimit);
  if (!chunks.length) return false;

  let sentAny = false;

  for (let i = 0; i < chunks.length; i++) {
    const finalMessage = `${prefix}${chunks[i]}`;
    if (shouldSuppressDuplicate(finalMessage)) continue;

    if (config.dryRun) {
      console.log(`[DRY RUN] would send: ${finalMessage}`);
      sentAny = true;
    } else {
      await client.say(channel, finalMessage);
      sentAny = true;
    }

    if (i < chunks.length - 1) await wait(CHUNK_DELAY_MS);
  }

  return sentAny;
}
