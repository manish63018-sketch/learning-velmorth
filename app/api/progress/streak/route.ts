import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// POST /api/progress/streak
// Idempotent daily streak check-in
// Body: {} (user identified via session cookie)
// ================================================================

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase.rpc('rpc_update_streak', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('[API streak] RPC error:', error);
      // Fallback: read and update manually
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const { data: current } = await supabase
        .from('user_streaks')
        .select('streak, longest, last_study_at, freeze_count')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!current) {
        await supabase.from('user_streaks').insert({ user_id: user.id, streak: 1, longest: 1, last_study_at: today });
        return NextResponse.json({ streak: 1, longest: 1, already_extended: false });
      }

      if (current.last_study_at === today) {
        return NextResponse.json({ streak: current.streak, longest: current.longest, already_extended: true });
      }

      const newStreak = current.last_study_at === yesterday ? current.streak + 1 : 1;
      const newLongest = Math.max(current.longest, newStreak);

      await supabase.from('user_streaks').update({
        streak: newStreak, longest: newLongest, last_study_at: today, updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);

      return NextResponse.json({ streak: newStreak, longest: newLongest, already_extended: false });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[API streak] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/progress/streak — get current streak state
export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('user_streaks')
      .select('streak, longest, last_study_at, freeze_count')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Failed to fetch streak' }, { status: 500 });

    const today = new Date().toISOString().split('T')[0];
    return NextResponse.json({
      streak: data?.streak ?? 0,
      longest: data?.longest ?? 0,
      last_study_at: data?.last_study_at ?? null,
      freeze_count: data?.freeze_count ?? 0,
      extended_today: data?.last_study_at === today,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
