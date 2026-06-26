import { NextRequest, NextResponse } from 'next/server';
import { PLANS, PlanId, calcEndsAt } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    const { planId } = await req.json() as { planId: PlanId };

    const plan = PLANS[planId];
    if (!plan || plan.price === 0) {
      return NextResponse.json(
        { error: `Invalid plan ID "${planId}". Valid: starter, plus, pro, ai_max` },
        { status: 400 }
      );
    }

    const keyId     = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: 'Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to env vars.' },
        { status: 503 }
      );
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:   plan.pricePaise,
        currency: 'INR',
        receipt:  `velmorth_${planId}_${Date.now()}`,
        notes: {
          planId,
          planName:      plan.name,
          billingPeriod: plan.periodLabel,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.description || 'Razorpay order creation failed');
    }

    const order = await response.json();
    const endsAt = calcEndsAt(planId);

    return NextResponse.json({
      orderId:       order.id,
      amount:        order.amount,
      currency:      order.currency,
      key:           keyId,
      planName:      plan.name,
      periodLabel:   plan.periodLabel,
      periodDays:    plan.periodDays,
      endsAt:        endsAt.toISOString(),
    });
  } catch (err: any) {
    console.error('[Billing] create-order error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
