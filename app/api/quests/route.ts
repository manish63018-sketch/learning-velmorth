import { NextResponse } from 'next/server';
import { generateDailyQuests } from '@evlo/core-logic';

export async function GET() {
  return NextResponse.json(generateDailyQuests());
}
