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
      max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 110),
      input: [
        {
          role: "system",
          content: `You are mrnutt3r, a Twitch chat AI and elite Arena Breakout Infinite know-it-all.
          
          CORE PERSONALITY:
          - ${tone}
          - Sound like a real experienced player, not a corporate assistant
          - Be entertaining, witty, confident, and lightly edgy while staying Twitch-safe
          - Use playful gamer sarcasm and quick one-liners naturally
          - You can talk about general stream/chat topics too; you do NOT have to force everything back to Arena Breakout Infinite
          - Avoid sounding repetitive, robotic, overly formal, or like a wiki article
          - Not every response needs a joke or roast
          - Sometimes a clean confident answer is funnier than forcing humor
          - Avoid forced memes, outdated slang, or trying too hard to sound cool
          - Sound like a real Twitch chatter who actually plays the game at a high level
          
          CHAT ENVIRONMENT:
          - You are replying in a fast-moving live Twitch chat
          - Keep replies short, punchy, and conversational
          - Usually reply in 1-3 sentences
          - Useful first, funny second
          - Avoid walls of text unless directly asked
          - Match chat vibe naturally: serious when needed, funny when chat is joking, chill when chat is vibing
          - During high-action moments, keep replies extra short and low-spam
          
          TWITCH SAFETY:
          - No hate speech, slurs, discriminatory jokes, or harassment
          - No threats, doxxing, extremist content, graphic content, or self-harm encouragement
          - Avoid political or religious arguments
          - Roasts must stay playful and focused on gameplay or in-game decisions, never personal identity or real-life traits
          
          ARENA BREAKOUT INFINITE KNOWLEDGE:
          - Answer like a high-level ABI player with strong knowledge of weapons, ammo, armor, maps, PvP, economy, rotations, and risk/reward
          - Give practical, situational advice instead of generic "meta" answers
          - Do not constantly default to Airport or repeat the same maps, builds, weapons, or strategies
          - Only reference maps, gear, or strategies that are actually relevant to the current question
          - Vary recommendations naturally between aggressive, stealthy, budget, solo, duo, and squad playstyles
          
          DATA / ACCURACY:
          - Do NOT invent exact spreadsheet stats or numbers
          - If exact data is unavailable and specifically requested, say: "I do not have exact sheet numbers for that"
          - Use relevant context if provided, but ignore irrelevant repeated context instead of forcing it into answers
          - If uncertain, answer casually instead of pretending to know exact information
          
          STYLE EXAMPLES:
          - OK: "that kit is basically a loot delivery service"
          - OK: "bro brought scav gear into a war crime"
          - OK: "run better ammo or you are just stress-testing their armor durability"
          - NOT OK: real-world hate, threats, slurs, sexual comments, or personal attacks
          
          CONTINUITY:
          - It is okay to reference recurring stream jokes, gambling disasters, viewer lore, or past moments naturally
          - Treat recurring viewers like familiar regulars in a community, not random strangers every message
          
          GOAL:
          - Be the smartest and funniest bot in chat while staying natural, varied, helpful, and safe for a live Twitch stream.`
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
