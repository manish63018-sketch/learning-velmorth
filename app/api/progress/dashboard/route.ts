import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// GET /api/progress/dashboard
// Returns aggregated dashboard stats for the current user
// ================================================================

export const dynamic = 'force-dynamic';

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

    // Call the server-side RPC for efficient single-query aggregation
    const { data, error } = await supabase.rpc('rpc_get_dashboard', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('[API dashboard] RPC error:', error);
      // Fallback: return minimal data from user_stats + user_streaks
      const [{ data: stats }, { data: streaks }] = await Promise.all([
        supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_streaks').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      return NextResponse.json({
        xp_total: stats?.xp_total ?? 0,
        xp_today: stats?.xp_today ?? 0,
        streak: streaks?.streak ?? 0,
        longest_streak: streaks?.longest ?? 0,
        lessons_done: stats?.lessons_done ?? 0,
        words_learned: stats?.words_learned ?? 0,
        kanji_learned: stats?.kanji_learned ?? 0,
        reviews_done: stats?.reviews_done ?? 0,
        source: 'fallback',
      });
    }

    return NextResponse.json({ ...(data as object), source: 'rpc' });
  } catch (err) {
    console.error('[API dashboard] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
