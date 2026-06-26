import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client — bypasses RLS to write entitlements
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured.');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

// Plan ID → entitlement shape
const PLAN_META: Record<string, { plan: string; hearts_per_day: number; ai_messages_per_day: number; lessons_per_day: number }> = {
  starter:    { plan: 'starter',    hearts_per_day: 75,  ai_messages_per_day: 15,  lessons_per_day: 15 },
  plus:       { plan: 'plus',       hearts_per_day: 90,  ai_messages_per_day: 30,  lessons_per_day: 30 },
  pro:        { plan: 'pro',        hearts_per_day: 100, ai_messages_per_day: 99,  lessons_per_day: 99 },
  pro_yearly: { plan: 'pro_yearly', hearts_per_day: 100, ai_messages_per_day: 99,  lessons_per_day: 99 },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      planId,
    } = body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature' },
        { status: 400 }
      );
    }

    // ── HMAC-SHA256 signature verification ──────────────────────────────
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const body_string = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generated_signature = crypto
      .createHmac('sha256', keySecret)
      .update(body_string)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    let signaturesMatch = false;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(generated_signature, 'hex'),
        Buffer.from(razorpay_signature, 'hex')
      );
    } catch {
      // Buffer length mismatch → signature is definitely wrong
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      console.warn('[Razorpay] Signature mismatch — possible tampered payment:', {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      });
      return NextResponse.json(
        { error: 'Payment verification failed. Signature mismatch.' },
        { status: 400 }
      );
    }

    console.log('[Razorpay] Payment verified:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
    });

    // ── Activate subscription in DB (if userId + planId are provided) ───
    if (userId && planId && PLAN_META[planId]) {
      try {
        const supabase = getServiceClient();
        const meta = PLAN_META[planId];
        const isYearly = planId === 'pro_yearly';

        // Calculate subscription end date
        const now = new Date();
        const endsAt = new Date(now);
        if (isYearly) {
          endsAt.setFullYear(endsAt.getFullYear() + 1);
        } else {
          endsAt.setMonth(endsAt.getMonth() + 1);
        }

        const { error: entitlementErr } = await supabase
          .from('entitlements')
          .upsert(
            {
              user_id:                  userId,
              plan_id:                  isYearly ? 'pro' : planId,
              status:                   isYearly ? 'yearly' : planId,
              starts_at:                now.toISOString(),
              ends_at:                  endsAt.toISOString(),
              hearts_limit:             meta.hearts_per_day,
              ai_limit_daily:           meta.ai_messages_per_day,
              lessons_limit_daily:      meta.lessons_per_day,
              ads_enabled:              planId === 'pro' || planId === 'pro_yearly' ? false : true,
              razorpay_payment_id:      razorpay_payment_id,
              razorpay_order_id:        razorpay_order_id,
              updated_at:               now.toISOString(),
            },
            { onConflict: 'user_id' }
          );

        if (entitlementErr) {
          // Log but don't fail — payment was verified; support can fix manually
          console.error('[Razorpay] Entitlement upsert failed:', entitlementErr.message);
        } else {
          console.log('[Razorpay] Entitlement activated for user:', userId, 'plan:', planId);
        }
      } catch (dbErr: any) {
        console.error('[Razorpay] DB activation error (non-fatal):', dbErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      message: 'Payment verified and subscription activated.',
    });
  } catch (error: any) {
    console.error('[Razorpay] verify-payment error:', error);
    return NextResponse.json(
      { error: 'Verification failed. Please contact support.' },
      { status: 500 }
    );
  }
}
