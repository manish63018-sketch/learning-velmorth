import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { data, error: fetchErr } = await userClient
      .from('payment_history')
      .select('id, plan_id, amount, currency, billing_period, razorpay_payment_id, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    return NextResponse.json({ history: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
