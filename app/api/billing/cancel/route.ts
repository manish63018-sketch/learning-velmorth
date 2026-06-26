import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Update entitlement to cancelled
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: updateErr } = await adminClient
      .from('entitlements')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('[Billing] Cancel subscription error:', updateErr);
      return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }

    // Log event
    await adminClient.from('activity_logs').insert({
      user_id: user.id,
      action:   'subscription_cancelled',
      metadata: { cancelled_at: new Date().toISOString() },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Billing] Cancel API general error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
