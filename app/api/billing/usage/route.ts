import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Auto-reset if stale
    const { data: entitlement } = await adminClient
      .from('entitlements')
      .select('ai_chats_used_today, ai_chats_reset_at, ai_limit_daily, plan_id, ends_at')
      .eq('user_id', user.id)
      .single();

    if (entitlement) {
      const needsReset = !entitlement.ai_chats_reset_at || entitlement.ai_chats_reset_at < today;
      if (needsReset) {
        await adminClient
          .from('entitlements')
          .update({ ai_chats_used_today: 0, ai_chats_reset_at: today })
          .eq('user_id', user.id);
        entitlement.ai_chats_used_today = 0;
        entitlement.ai_chats_reset_at = today;
      }
    }

    const used  = entitlement?.ai_chats_used_today ?? 0;
    const limit = entitlement?.ai_limit_daily ?? 5;

    return NextResponse.json({
      used,
      limit,
      remaining: Math.max(0, limit - used),
      planId:    entitlement?.plan_id ?? 'free',
      endsAt:    entitlement?.ends_at ?? null,
      resetAt:   today,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Increment ai_chats_used_today
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split('T')[0];

    const { data: ent } = await adminClient
      .from('entitlements')
      .select('ai_chats_used_today, ai_chats_reset_at, ai_limit_daily')
      .eq('user_id', user.id)
      .single();

    const needsReset = !ent?.ai_chats_reset_at || ent.ai_chats_reset_at < today;
    const currentUsed = needsReset ? 0 : (ent?.ai_chats_used_today ?? 0);
    const limit = ent?.ai_limit_daily ?? 5;

    if (currentUsed >= limit) {
      return NextResponse.json({ error: 'Daily AI chat limit reached', used: currentUsed, limit }, { status: 429 });
    }

    await adminClient
      .from('entitlements')
      .update({
        ai_chats_used_today: currentUsed + 1,
        ai_chats_reset_at: today,
      })
      .eq('user_id', user.id);

    return NextResponse.json({ used: currentUsed + 1, limit, remaining: limit - currentUsed - 1 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
