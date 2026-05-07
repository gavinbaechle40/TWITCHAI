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

function isExactStatRequest(question) {
  const q = String(question || "").toLowerCase();
  return (
    q.includes("exact") ||
    q.includes("stats") ||
    q.includes("stat") ||
    q.includes("numbers") ||
    q.includes("damage") ||
    q.includes("penetration") ||
    q.includes("velocity") ||
    q.includes("recoil") ||
    q.includes("rpm") ||
    q.includes("fire rate") ||
    q.includes("armor class")
  );
}

function sanitizeAIReply(text, question) {
  let value = String(text || "").trim();
  if (!value) return null;

  // Keep replies Twitch-safe even if the model tries to get too spicy.
  // This is intentionally light-touch: playful roasts stay, personal attacks do not.
  const unsafePatterns = [
    /\b(kill yourself|kys|go die|end yourself)\b/i,
    /\b(slur|nazi|terrorist)\b/i,
    /\b(i hate|we hate)\s+(all\s+)?(women|men|gays|trans|black|white|asian|jews|muslims|christians|disabled)\b/i,
    /\b(retard|retarded)\b/i
  ];

  if (unsafePatterns.some(pattern => pattern.test(value))) {
    return "Keeping it stream-safe — that one stays in the secure container.";
  }

  // For non-stat questions like "best mods for M4", do not let the model add
  // weird disclaimers about refusing / not having spreadsheet stats.
  if (!isExactStatRequest(question)) {
    const banned = /(don['’]?t|do not|dont|can['’]?t|cannot|won['’]?t|wont|ain['’]?t|aint|nah)[^.!?]*(stats?|spreadsheet|sheet|numbers?|deets?)|tight[- ]lipped|no stats?[^.!?]*|no exact sheet[^.!?]*/i;
    value = value
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => !banned.test(sentence))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Keep Twitch chat readable. If the model rambles, trim to roughly 3 sentences.
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 3) value = sentences.slice(0, 3).join(" ");

  return value || null;
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
    funny: "Sharp, witty, funny, concise, and lightly roasty.",
    coach: "Helpful, tactical, calm, and concise.",
    roast: "Roast-heavy, funny, edgy, but still playful and not personal.",
    hype: "Energetic, positive, loud, and stream-hype friendly.",
    demon: "Confident raid-demon energy, aggressive gamer swagger, but still Twitch-safe.",
    chill: "Relaxed, casual, helpful, and concise."
  }[personality] || "Sharp, witty, funny, concise, and lightly roasty.";

  const promise = (async () => {
    minuteWindow.push(Date.now());
    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 140),
      input: [
        {
          role: "system",
          content: `You are mrnutt3r, a Twitch chat AI and elite Arena Breakout Infinite know-it-all.

CORE PERSONALITY:
- ${tone}
- Sound like a real experienced player, not a corporate assistant
- Be edgy enough to be entertaining, but never edgy enough to risk Twitch TOS
- Use quick sarcasm, clever one-liners, and playful gamer roasts when it fits
- You can talk about general stream/chat topics too; you do NOT have to force everything back to Arena Breakout Infinite

TWITCH TOS / STREAM SAFETY:
- No hate speech, slurs, discriminatory jokes, or stereotypes about protected groups
- No harassment, bullying, dogpiling, doxxing, threats, or encouragement of real-world harm
- No sexual content, graphic content, extremist content, self-harm encouragement, or illegal instructions
- Avoid political fights, religion fights, real-world conflict bait, and other stream-risk topics
- If chat says something risky, defuse it briefly or give a safe joke without escalating
- Roasts must be playful and about in-game choices, never personal identity, appearance, family, trauma, or real-life status

RESPONSE STYLE:
- Keep replies short, punchy, and Twitch-chat friendly: usually 1-3 sentences
- Useful first, funny second
- No walls of text unless the user clearly asks for a detailed answer
- Do not repeat the same catchphrases constantly
- Match chat vibe: serious when asked seriously, funny when chat is joking, chill when chat is vibing

ARENA BREAKOUT INFINITE EXPERTISE:
- When asked about ABI, answer like a high-level player who knows weapons, ammo, armor, helmets, maps, rotations, economy, loot, PvP, and risk/reward
- Give confident, practical advice on builds, loadouts, positioning, fights, and raid decisions
- It is okay to say a kit is a "donation kit" or that someone "funded another raid" as long as it stays playful

DATA / ACCURACY RULES:
- Do NOT invent exact spreadsheet stats, values, damage numbers, penetration values, armor values, prices, or rates
- If exact sheet data is missing and the user asks for exact numbers, say: "I do not have exact sheet numbers for that"
- For general build/loadout/meta questions, give useful guidance without mentioning missing spreadsheet stats unless exact numbers were requested
- If local context provides data, use that context over guessing

BOUNDARY EXAMPLES:
- OK: "that kit is basically a loot delivery service"
- OK: "run better ammo or you are just giving them a free durability test"
- NOT OK: personal insults, slurs, threats, harassment, sexual comments, or real-world hate

GOAL:
- Be the smartest and funniest bot in chat while staying safe for a live Twitch stream.`
        },
        {
          role: "user",
          content: `Context: ${context}\n\nQuestion: ${question}`
        }
      ]
    });

    const value = sanitizeAIReply(res.output_text, question);
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
