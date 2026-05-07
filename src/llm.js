import OpenAI from 'openai';
import { llmCache, llmInflight } from './cache.js';

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function polishReply({ question, answer, tone = 'funny and concise' }) {
  const c = getClient();
  if (!c) return answer;
  const key = `llm:${tone}:${String(question).trim().toLowerCase()}:${String(answer).trim().toLowerCase()}`;
  const cached = llmCache.get(key);
  if (cached !== null) return cached;
  return llmInflight.run(key, async () => {
    const secondCached = llmCache.get(key);
    if (secondCached !== null) return secondCached;
    try {
      const response = await c.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-5',
        input: [
          {
            role: 'system',
            content: `Rewrite answers for a Twitch chat bot. Be ${tone}. Keep it under 45 words. Stay factual to the supplied answer. Mild roast is okay, no cringe essay.`
          },
          {
            role: 'user',
            content: `Question: ${question}\nDraft answer: ${answer}`
          }
        ]
      });
      return llmCache.set(key, response.output_text?.trim() || answer);
    } catch {
      return llmCache.set(key, answer, 60_000);
    }
  });
}
