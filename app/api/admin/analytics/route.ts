import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// ================================================================
// GET /api/admin/analytics?days=30
// Returns full admin analytics — restricted to admin_roles table
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

    // Verify admin role
    const { data: adminRole } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRole) return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 365);

    // Use service role for full analytics access
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await adminSupabase.rpc('rpc_admin_analytics', {
      p_days: days,
    });

    if (error) {
      console.error('[API admin analytics] RPC error:', error);

      // Fallback: manual queries
      const [
        { count: totalUsers },
        { count: totalMessages },
        { data: recentActivity },
        { data: topLessons },
        { data: xpByType },
      ] = await Promise.all([
        adminSupabase.from('profiles').select('*', { count: 'exact', head: true }),
        adminSupabase.from('ai_chat_messages').select('*', { count: 'exact', head: true }),
        adminSupabase.from('daily_activity')
          .select('user_id, activity_date, xp_earned, lessons_completed')
          .gte('activity_date', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
          .order('activity_date', { ascending: false })
          .limit(1000),
        adminSupabase.from('lesson_progress')
          .select('lesson_id')
          .eq('status', 'completed')
          .gte('completed_at', new Date(Date.now() - days * 86400000).toISOString())
          .limit(500),
        adminSupabase.from('xp_events')
          .select('event_type, xp_amount')
          .gte('earned_at', new Date(Date.now() - days * 86400000).toISOString())
          .limit(5000),
      ]);

      // Compute lesson completion counts
      const lessonCounts: Record<string, number> = {};
      for (const r of topLessons ?? []) {
        lessonCounts[r.lesson_id] = (lessonCounts[r.lesson_id] ?? 0) + 1;
      }

      // Compute XP by type
      const xpMap: Record<string, number> = {};
      for (const e of xpByType ?? []) {
        xpMap[e.event_type] = (xpMap[e.event_type] ?? 0) + e.xp_amount;
      }

      // Daily unique active users
      const dailyActive: Record<string, Set<string>> = {};
      for (const r of recentActivity ?? []) {
        if (!dailyActive[r.activity_date]) dailyActive[r.activity_date] = new Set();
        dailyActive[r.activity_date].add(r.user_id);
      }

      const activeLast30d = new Set<string>();
      for (const set of Object.values(dailyActive)) {
        set.forEach(userId => {
          activeLast30d.add(userId);
        });
      }

      return NextResponse.json({
        overview: {
          total_users: totalUsers,
          total_messages: totalMessages,
          active_last_30d: activeLast30d.size,
        },
        lesson_completions: Object.entries(lessonCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20)
          .map(([lesson_id, completions]) => ({ lesson_id, completions })),
        xp_by_type: xpMap,
        source: 'fallback',
      });
    }

    return NextResponse.json({ ...(data as object), source: 'rpc' });
  } catch (err) {
    console.error('[API admin analytics] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
