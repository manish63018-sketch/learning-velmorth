import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';

// Initialize Razorpay instance lazily to prevent build-time crashes if environment variables are not set
let razorpayInstance: Razorpay | null = null;
function getRazorpay() {
  if (!razorpayInstance) {
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials are not fully configured in environment variables.');
    }

    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount, currency = 'INR', receipt } = body;

    // Validate — minimum 100 paise (₹1)
    if (!amount || typeof amount !== 'number' || amount < 100) {
      return NextResponse.json(
        { error: 'Invalid amount. Minimum is 100 paise (₹1).' },
        { status: 400 }
      );
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount,            // in paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: any) {
    console.error('[Razorpay] create-order error:', error);

    if (error?.statusCode === 401) {
      return NextResponse.json(
        { error: 'Razorpay authentication failed. Check your KEY_ID and KEY_SECRET.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create order. Please try again.' },
      { status: 500 }
    );
  }
}
