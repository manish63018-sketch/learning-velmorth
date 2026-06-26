import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { PLANS, PlanId, calcEndsAt } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
    } = await req.json() as {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      planId: PlanId;
    };

    // ── Validate inputs ────────────────────────────────────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const plan = PLANS[planId];
    if (!plan || plan.price === 0) {
      return NextResponse.json({ error: `Unknown or free plan: ${planId}` }, { status: 400 });
    }

    // ── Verify Razorpay HMAC signature ─────────────────────────────────────────
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: 'Razorpay secret not configured' }, { status: 503 });
    }

    const bodyStr  = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(bodyStr).digest('hex');

    let sigValid = false;
    try {
      sigValid = crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(razorpay_signature, 'hex')
      );
    } catch { sigValid = false; }

    if (!sigValid) {
      return NextResponse.json({ error: 'Payment signature invalid' }, { status: 400 });
    }

    // ── Authenticate user from bearer token ────────────────────────────────────
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized — missing token' }, { status: 401 });
    }

    const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid user token' }, { status: 401 });
    }

    // ── Update entitlement ─────────────────────────────────────────────────────
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const endsAt      = calcEndsAt(planId);

    const { error: upsertErr } = await adminClient
      .from('entitlements')
      .upsert({
        user_id:              user.id,
        plan_id:              planId,
        status:               planId,                // 'starter'|'plus'|'pro'|'ai_max'
        starts_at:            new Date().toISOString(),
        ends_at:              endsAt.toISOString(),
        razorpay_payment_id,
        razorpay_order_id,
        hearts_limit:         plan.heartsMax,
        ai_limit_daily:       plan.aiChatsPerDay,
        lessons_limit_daily:  plan.lessonsPerDay ?? 9999,
        ads_enabled:          plan.adsEnabled,
        billing_period:       plan.periodDays ? `${plan.periodDays}d` : null,
        ai_chats_used_today:  0,
        ai_chats_reset_at:    new Date().toISOString().split('T')[0],
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('[Billing] Failed to update entitlement:', upsertErr);
      return NextResponse.json({ error: 'Failed to activate plan' }, { status: 500 });
    }

    // ── Insert payment history ─────────────────────────────────────────────────
    await adminClient.from('payment_history').insert({
      user_id:             user.id,
      plan_id:             planId,
      amount:              plan.pricePaise,
      currency:            'INR',
      billing_period:      plan.periodDays ? `${plan.periodDays}d` : null,
      razorpay_order_id,
      razorpay_payment_id,
      status:              'success',
    });

    // ── Log activity ───────────────────────────────────────────────────────────
    await adminClient.from('activity_logs').insert({
      user_id: user.id,
      action:  'payment_success',
      metadata: {
        plan_id:    planId,
        plan_name:  plan.name,
        amount:     plan.price,
        payment_id: razorpay_payment_id,
        order_id:   razorpay_order_id,
        ends_at:    endsAt.toISOString(),
      },
    });

    return NextResponse.json({
      success:   true,
      plan:      planId,
      planName:  plan.name,
      endsAt:    endsAt.toISOString(),
    });
  } catch (err: any) {
    console.error('[Billing] verify error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
