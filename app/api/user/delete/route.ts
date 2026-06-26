import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/user/delete
 * Deletes the authenticated user's account from Supabase Auth and cascade deletes all DB tables.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey     = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify authenticated user
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Initialize admin client to perform user deletion
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.error('[User Delete] Error:', deleteErr.message);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (err: any) {
    console.error('[User Delete] Error:', err.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
