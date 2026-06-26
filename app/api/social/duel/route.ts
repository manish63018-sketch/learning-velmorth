import { NextResponse } from 'next/server';
import { calcDuelResult } from '@/services/core-logic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = calcDuelResult(
      body.challenger_score || 0,
      body.opponent_score || 0,
      body.xp_stake || 0
    );
    return NextResponse.json({
      winner_id: result.winnerId,
      xp_delta: result.xpDelta,
      message: result.message
    });
  } catch (error: any) {
    console.error('Duel Score failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
