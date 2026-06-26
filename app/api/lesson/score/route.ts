import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { total_questions = 0, correct_answers = 0, time_seconds = 0 } = body;

    if (total_questions === 0) {
      return NextResponse.json({
        accuracy: 0.0,
        xp: 0,
        mastery_delta: 0.0,
      });
    }

    const accuracy = correct_answers / total_questions;
    const speed_bonus = time_seconds < 90 ? 10 : 0;
    const xp = Math.round(accuracy * 50) + speed_bonus;
    const mastery_delta = accuracy * 0.15;

    return NextResponse.json({
      accuracy,
      xp,
      mastery_delta,
    });
  } catch (error: any) {
    console.error('Score Lesson failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
