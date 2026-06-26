import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([
    { friend_id: 'f1', username: 'Sakura_99', avatar: '🌸', xp: 1240, streak: 12, status: 'accepted', lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), nudged_today: false },
    { friend_id: 'f2', username: 'TokyoDrift', avatar: '🏎️', xp: 890, streak: 5, status: 'accepted', lastActive: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), nudged_today: false },
    { friend_id: 'f3', username: 'NihongoKing', avatar: '👑', xp: 2100, streak: 30, status: 'pending', lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), nudged_today: false },
  ]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      friend: {
        friend_id: `f-${Date.now()}`,
        username: body.username || 'New Friend',
        avatar: '👤',
        xp: 0,
        streak: 0,
        status: 'pending',
        lastActive: new Date().toISOString(),
        nudged_today: false
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
