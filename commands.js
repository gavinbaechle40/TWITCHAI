import OpenAI from "openai";
import { config } from "./config.js";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const aiCache = new Map();
const inflight = new Map();
const minuteWindow = [];

function cleanWindow() {
  const cutoff = Date.now() - 60000;
  while (minuteWindow.length && minuteWindow[0] < cutoff) minuteWindow.shift();
}

function cacheKey(question, context, personality) {
  return `${personality}::${question}::${context}`;
}

export async function askAI({ question, context = "", personality = "funny" }) {
  if (!config.openAIEnabled || !client) return null;

  const key = cacheKey(question, context, personality);
  const cached = aiCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (inflight.has(key)) return inflight.get(key);

  cleanWindow();
  const maxCalls = Number(process.env.AI_MAX_CALLS_PER_MINUTE || 20);
  if (minuteWindow.length >= maxCalls) return null;

  const tone = {
    funny: "Funny, concise, playful, a little roasty.",
    coach: "Helpful, tactical, concise.",
    roast: "Funny and roast-heavy but still useful.",
    hype: "Energetic, positive, hype.",
    demon: "Aggressive gamer confidence, still safe.",
    chill: "Relaxed, helpful, concise."
  }[personality] || "Funny, concise, playful.";

  const promise = (async () => {
    minuteWindow.push(Date.now());
    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `You are mrnutt3r, a Twitch bot for Arena Breakout Infinite.

PERSONALITY:
- ${tone}
- Keep responses short, fast, and stream-friendly

STRICT RULES:
- Only talk about Arena Breakout Infinite, gameplay, or light harmless small talk
- Do NOT engage in politics, religion, elections, real-world conflict, hate, harassment, extremist content, sexual content, self-harm, or other controversial/off-platform-risk topics
- Light gaming roasts are fine, but keep them playful and non-harassing
- If asked about risky or off-topic content, decline briefly and steer back to the game`
        },
        {
          role: "user",
          content: `Context: ${context}\n\nQuestion: ${question}`
        }
      ]
    });

    const value = res.output_text?.trim() || null;
    aiCache.set(key, {
      value,
      expiresAt: Date.now() + Number(process.env.AI_DEDUPE_TTL_MS || 15000)
    });
    return value;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
