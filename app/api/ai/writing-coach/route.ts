import { NextResponse } from 'next/server';
import { callGemini, extractGeminiText, VELMORTH_SENSEI_PROMPT } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { character, image } = body;

    if (!character || !image) {
      return NextResponse.json({ error: 'Character and image data are required.' }, { status: 400 });
    }

    const prompt = `
You are Velmorth Sensei, an expert Japanese calligraphy (Shodo) coach.
The student is practicing writing the Japanese character: "${character}".
Review their hand-drawn stroke representation in the attached image.
Provide feedback on:
1. Shape / Curvature (are the curves and angles correct?)
2. Proportion & Balance (are the strokes correctly sized and aligned?)
3. Stroke Ends (are the starts and ends clean?)

Be encouraging and friendly. Highlight what they did well first, then give 1 constructive suggestion. Keep your feedback under 75 words.
`.trim();

    const data = await callGemini(
      [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: image,
              },
            },
          ],
        },
      ],
      VELMORTH_SENSEI_PROMPT
    );

    const feedback = extractGeminiText(data);

    return NextResponse.json({
      feedback: feedback || '💡 Velmorth Sensei Tip: Pay close attention to curves and line weight. Take your time drawing and trace carefully!',
    });
  } catch (error: any) {
    console.error('[Gemini AI Coach] Writing coach api error:', error.message);
    return NextResponse.json({
      feedback: '💡 Velmorth Sensei Tip: Focus on drawing slowly and following the guided animations. Good brush control comes with practice!',
    });
  }
}
