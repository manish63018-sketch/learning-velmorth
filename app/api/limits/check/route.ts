import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/limits/check
 * Returns the user's current daily usage vs their plan limits.
 * Used by lesson start, AI chat, and review flows to gate access.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey     = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Fetch entitlement limits
    const { data: ent } = await admin
      .from('entitlements')
      .select('hearts_limit, ai_limit_daily, lessons_limit_daily, ads_enabled, status, plan_id')
      .eq('user_id', user.id)
      .single();

    // Fetch today's usage
    const { data: usage } = await admin
      .from('usage_counters')
      .select('ai_requests, lessons_started, hearts_used')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    const limits = ent ?? { hearts_limit: 25, ai_limit_daily: 5, lessons_limit_daily: 5, ads_enabled: true, status: 'free', plan_id: 'free' };
    const used   = usage ?? { ai_requests: 0, lessons_started: 0, hearts_used: 0 };

    return NextResponse.json({
      plan:                limits.plan_id,
      status:              limits.status,
      ads_enabled:         limits.ads_enabled,
      hearts_limit:        limits.hearts_limit,
      hearts_used:         used.hearts_used,
      hearts_remaining:    Math.max(0, limits.hearts_limit - used.hearts_used),
      ai_limit_daily:      limits.ai_limit_daily,
      ai_used_today:       used.ai_requests,
      can_use_ai:          used.ai_requests < limits.ai_limit_daily,
      lessons_limit_daily: limits.lessons_limit_daily,
      lessons_today:       used.lessons_started,
      can_start_lesson:    used.lessons_started < limits.lessons_limit_daily,
    });
  } catch (err: any) {
    console.error('[Limits] check error:', err.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
