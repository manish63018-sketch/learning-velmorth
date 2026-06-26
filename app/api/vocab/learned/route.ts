import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* called from Server Component, ignored */ }
        },
      },
    }
  );
}

// GET /api/vocab/learned — return all learned word IDs for current user
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('user_learned_words')
      .select('word_id, quiz_eligible, first_seen_at, learn_count')
      .eq('user_id', user.id)
      .eq('quiz_eligible', true);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ learned: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/vocab/learned — mark a word as learned
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { word_id } = body;
    if (!word_id) return NextResponse.json({ error: 'word_id is required' }, { status: 400 });

    // Upsert — if already exists, increment learn_count
    const { data: existing } = await supabase
      .from('user_learned_words')
      .select('id, learn_count')
      .eq('user_id', user.id)
      .eq('word_id', word_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('user_learned_words')
        .update({ learn_count: (existing.learn_count || 1) + 1, quiz_eligible: true })
        .eq('id', existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from('user_learned_words')
        .insert({
          user_id: user.id,
          word_id,
          quiz_eligible: true,
          first_seen_at: new Date().toISOString(),
          learn_count: 1,
        });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
