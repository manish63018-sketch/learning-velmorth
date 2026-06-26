import { NextResponse } from 'next/server';
import { callGemini, extractGeminiText, VELMORTH_SENSEI_PROMPT } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { grammar_id, structure, title, explanation_en, explanation_hi, lang } = body;

    const userLang = lang === 'hi' ? 'Hindi' : 'English';

    const prompt = `
You are Velmorth Sensei. A student just got a Japanese grammar question wrong.

Grammar point: "${title}"
Structure: ${structure || 'N/A'}
Context: ${explanation_en || ''}

Explain this grammar rule clearly. Always include:
1. 日本語 (Japanese example sentence with furigana)
2. Romaji reading
3. ${userLang} translation
4. One simple grammar tip they should remember

Keep your explanation under 120 words. Be encouraging and friendly. End with a 💡 tip.
`.trim();

    const data = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      VELMORTH_SENSEI_PROMPT
    );

    const explanation = extractGeminiText(data);

    return NextResponse.json({
      grammar_id,
      explanation,
      fallback: false,
    });
  } catch (error: any) {
    console.error('[Gemini] Explain route error:', error.message);
    return NextResponse.json({
      explanation: `💡 Grammar tip: Focus on the sentence structure.
Japanese follows Subject-Object-Verb (SOV) order.
Example: 私は本を読みます (Watashi wa hon wo yomimasu) — "I read a book."
Practice by making your own sentences using this pattern!`,
      fallback: true,
    });
  }
}
