import { NextResponse } from 'next/server';
import { callGemini, extractGeminiText, VELMORTH_SENSEI_PROMPT } from '@/lib/gemini';

// Rate-limit map: userId → last request timestamps (simple in-memory sliding window)
const rateLimitMap = new Map<string, number[]>();
const MAX_REQUESTS_PER_MIN = 10;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (rateLimitMap.get(userId) ?? []).filter(ts => now - ts < windowMs);
  if (timestamps.length >= MAX_REQUESTS_PER_MIN) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

// Enforced JSON suffix — appended to every system prompt so Gemini always
// returns a parseable structure instead of free-form text.
const JSON_STRUCTURE_SUFFIX = `

IMPORTANT — You MUST respond ONLY with a valid JSON object. No prose, no markdown fences.
The JSON must have exactly these four keys:
{
  "content_ja": "<Japanese text using kanji and kana>",
  "content_romaji": "<romaji reading of the Japanese text>",
  "content_en": "<English translation>",
  "grammar_note": "<one helpful grammar or vocabulary tip, starting with 💡>"
}
If the user writes something unrelated to Japanese language learning, respond:
{
  "content_ja": "日本語の勉強に集中しましょう！",
  "content_romaji": "Nihongo no benkyou ni shuuchuu shimashou!",
  "content_en": "Let's focus on Japanese learning!",
  "grammar_note": "💡 I can only help with Japanese language topics."
}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id, messages = [], topic, difficulty, user_id } = body;

    // Per-user rate limiting
    if (user_id && isRateLimited(user_id)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Build conversation history for Gemini
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Add current user turn if no history provided
    if (contents.length === 0) {
      const contextText = topic
        ? `Let's practice Japanese conversation about: ${topic}. Difficulty: ${difficulty || 'beginner'}.`
        : 'こんにちは！Let\'s start our Japanese lesson.';
      contents.push({ role: 'user', parts: [{ text: contextText }] });
    }

    // Combine master sensei prompt with strict JSON enforcement
    const systemPrompt = VELMORTH_SENSEI_PROMPT + JSON_STRUCTURE_SUFFIX;

    const data = await callGemini(contents, systemPrompt);
    const responseText = extractGeminiText(data);

    // Parse structured JSON response
    let parsed: {
      content_ja: string;
      content_romaji: string;
      content_en: string;
      grammar_note: string;
    };

    try {
      // Strip markdown code fences if Gemini wraps in ```json ... ```
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: extract fields using regex if JSON parse fails
      const jaMatch     = responseText.match(/"content_ja"\s*:\s*"([^"]+)"/);
      const romajiMatch = responseText.match(/"content_romaji"\s*:\s*"([^"]+)"/);
      const enMatch     = responseText.match(/"content_en"\s*:\s*"([^"]+)"/);
      const noteMatch   = responseText.match(/"grammar_note"\s*:\s*"([^"]+)"/);

      // Ultimate fallback: pull first Japanese line
      const jaFallback  = responseText.match(/[ぁ-んァ-ヶ一-龥][^\n]*/)?.[0] ?? responseText;

      parsed = {
        content_ja:     jaMatch?.[1]     ?? jaFallback,
        content_romaji: romajiMatch?.[1] ?? '',
        content_en:     enMatch?.[1]     ?? '',
        grammar_note:   noteMatch?.[1]   ?? '',
      };
    }

    return NextResponse.json({
      message_id:     `ai-${Date.now()}`,
      role:           'assistant',
      content_ja:     parsed.content_ja     || '',
      content_romaji: parsed.content_romaji || '',
      content_en:     parsed.content_en     || '',
      grammar_note:   parsed.grammar_note   || '',
      raw:            responseText,
      timestamp:      new Date().toISOString(),
      fallback:       false,
    });
  } catch (error: any) {
    console.error('[Gemini] Conversation route error:', error.message);
    return NextResponse.json({
      message_id:     `ai-fallback-${Date.now()}`,
      role:           'assistant',
      content_ja:     'はじめまして！日本語を一緒に勉強しましょう。',
      content_romaji: 'Hajimemashite! Nihongo o issho ni benkyou shimashou.',
      content_en:     "Nice to meet you! Let's study Japanese together.",
      grammar_note:   '💡 はじめまして (hajimemashite) is the formal greeting when meeting someone for the first time.',
      timestamp:      new Date().toISOString(),
      fallback:       true,
    });
  }
}
