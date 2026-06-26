import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { answers = [], correct_answers = [], elapsed_seconds = 0 } = body;

    if (correct_answers.length === 0) {
      return NextResponse.json({
        score_percentage: 0,
        passed: false,
        xp_rewarded: 0,
        cheated: false,
        anti_cheat_reason: 'No questions provided',
      });
    }

    let correct_count = 0;
    answers.forEach((ans: string, i: number) => {
      if (i < correct_answers.length && ans === correct_answers[i]) {
        correct_count++;
      }
    });

    const score_percentage = Math.round((correct_count * 100) / correct_answers.length);
    const passed = score_percentage >= 70;

    let cheated = false;
    let anti_cheat_reason = null;
    if (elapsed_seconds < 3 && correct_answers.length > 3) {
      cheated = true;
      anti_cheat_reason = 'Lesson completed too fast (under 3 seconds)';
    }

    const xp_rewarded = cheated ? 0 : passed ? 10 : 2;

    return NextResponse.json({
      score_percentage,
      passed,
      xp_rewarded,
      cheated,
      anti_cheat_reason,
    });
  } catch (error: any) {
    console.error('Score Lesson failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
