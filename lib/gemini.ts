/**
 * Gemini API — 4-key rotation utility
 * All keys are stored in Vercel env vars (server-side only).
 * NEVER expose these keys to client code.
 */

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean) as string[];

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Velmorth Sensei — Japanese tutor system prompt (Part 5 of master checklist)
export const VELMORTH_SENSEI_PROMPT = `You are Velmorth Sensei, a friendly Japanese language tutor.
You help users learn Japanese only.
You support JLPT levels N5 to N1.
Always respond in this format:
- Japanese text (kanji + kana)
- Romaji reading
- English translation
- One grammar or vocabulary note
When the user makes a mistake, gently correct it.
Keep responses short and educational.
Do not discuss topics unrelated to Japanese language learning.
Do not generate harmful, adult, or off-topic content.
Always encourage the learner.`;

export interface GeminiContent {
  parts: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[];
  role?: 'user' | 'model';
}


/**
 * Call Gemini with automatic key rotation.
 * If a key hits a 429 rate-limit, the next key is tried automatically.
 * Throws only when all 4 keys are exhausted.
 */
export async function callGemini(
  contents: GeminiContent[],
  systemInstruction?: string,
  attempt = 0
): Promise<any> {
  if (GEMINI_KEYS.length === 0) {
    throw new Error('No Gemini API keys configured. Set GEMINI_API_KEY_1…4 in env vars.');
  }
  if (attempt >= GEMINI_KEYS.length) {
    throw new Error('All Gemini API keys exhausted (rate-limited).');
  }

  const key = GEMINI_KEYS[attempt];

  const body: any = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(`${GEMINI_BASE}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Rate limited — try next key
  if (res.status === 429) {
    console.warn(`[Gemini] Key ${attempt + 1} rate-limited. Trying key ${attempt + 2}…`);
    return callGemini(contents, systemInstruction, attempt + 1);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  return res.json();
}

/**
 * Extract the text response from a Gemini API response.
 */
export function extractGeminiText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
