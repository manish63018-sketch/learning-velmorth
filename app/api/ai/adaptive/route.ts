import { NextResponse } from 'next/server';
import { callGemini, extractGeminiText } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accuracy_history = [], completed_count = 0 } = body;

    const avgAccuracy =
      accuracy_history.length > 0
        ? Math.round(accuracy_history.reduce((a: number, b: number) => a + b, 0) / accuracy_history.length)
        : 75;

    // Simple rule-based adaptive difficulty (no Gemini needed for this calculation)
    let recommended_level = 'beginner';
    let weak_areas: string[] = [];
    let strong_areas: string[] = [];
    let confidence_score = avgAccuracy;

    if (avgAccuracy >= 85 && completed_count >= 10) {
      recommended_level = 'intermediate';
      strong_areas = ['vocabulary', 'grammar'];
      weak_areas = ['kanji', 'listening'];
    } else if (avgAccuracy >= 70) {
      recommended_level = 'beginner';
      strong_areas = ['greetings', 'numbers'];
      weak_areas = ['particles', 'verb conjugation'];
    } else {
      recommended_level = 'foundation';
      strong_areas = ['hiragana'];
      weak_areas = ['vocabulary', 'grammar', 'particles'];
    }

    // Use Gemini to generate a personalized study tip
    let study_tip = '';
    try {
      const prompt = `A Japanese learner has ${avgAccuracy}% accuracy across ${completed_count} lessons. Their weak areas are: ${weak_areas.join(', ')}. Give them one short, specific, actionable study tip in under 30 words. Be encouraging.`;
      const data = await callGemini([{ role: 'user', parts: [{ text: prompt }] }]);
      study_tip = extractGeminiText(data);
    } catch {
      study_tip = `Focus on ${weak_areas[0] || 'vocabulary'} today — even 10 minutes of practice makes a big difference! がんばって！`;
    }

    return NextResponse.json({
      recommended_level,
      accuracy_7day: avgAccuracy,
      weak_areas,
      strong_areas,
      confidence_score,
      study_tip,
      fallback: false,
    });
  } catch (error: any) {
    console.error('[Gemini] Adaptive route error:', error.message);
    return NextResponse.json({
      recommended_level: 'beginner',
      accuracy_7day: 75,
      weak_areas: ['vocabulary'],
      strong_areas: ['greetings'],
      confidence_score: 80,
      study_tip: 'Review your flashcards daily — consistency beats intensity! がんばって！',
      fallback: true,
    });
  }
}
