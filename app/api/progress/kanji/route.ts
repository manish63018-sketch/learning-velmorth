import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// PATCH /api/progress/kanji
// Save kanji writing/stroke/recognition practice result
// Body: { kanjiId, writingCorrect?, strokeCorrect?, recognitionCorrect? }
// ================================================================

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { kanjiId, writingCorrect, strokeCorrect, recognitionCorrect } = body;

    if (!kanjiId) return NextResponse.json({ error: 'kanjiId is required' }, { status: 400 });

    // Fetch existing
    const { data: existing } = await supabase
      .from('kanji_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('kanji_id', kanjiId)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      kanji_id: kanjiId,
      last_practiced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof writingCorrect === 'boolean') {
      upsertData.writing_attempts = (existing?.writing_attempts ?? 0) + 1;
      upsertData.writing_correct = (existing?.writing_correct ?? 0) + (writingCorrect ? 1 : 0);
    }
    if (typeof strokeCorrect === 'boolean') {
      upsertData.stroke_attempts = (existing?.stroke_attempts ?? 0) + 1;
      upsertData.stroke_correct = (existing?.stroke_correct ?? 0) + (strokeCorrect ? 1 : 0);
    }
    if (typeof recognitionCorrect === 'boolean') {
      upsertData.recognition_attempts = (existing?.recognition_attempts ?? 0) + 1;
      upsertData.recognition_correct = (existing?.recognition_correct ?? 0) + (recognitionCorrect ? 1 : 0);
    }

    // Determine status from accuracy
    const wa = upsertData.writing_attempts as number ?? existing?.writing_attempts ?? 0;
    const wc = upsertData.writing_correct as number ?? existing?.writing_correct ?? 0;
    const ra = upsertData.recognition_attempts as number ?? existing?.recognition_attempts ?? 0;
    const rc = upsertData.recognition_correct as number ?? existing?.recognition_correct ?? 0;
    const totalAttempts = wa + ra;
    const totalCorrect = wc + rc;
    const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

    if (accuracy >= 0.9 && totalAttempts >= 5) {
      upsertData.status = 'mastered';
      if (!existing?.mastered_at) upsertData.mastered_at = new Date().toISOString();
    } else if (totalAttempts >= 1) {
      upsertData.status = 'learning';
    }

    const { data, error } = await supabase
      .from('kanji_progress')
      .upsert(upsertData, { onConflict: 'user_id,kanji_id' })
      .select()
      .single();

    if (error) {
      console.error('[API kanji] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to update kanji progress' }, { status: 500 });
    }

    // If first time practicing this kanji, increment kanji_learned stat
    if (!existing) {
      await supabase
        .from('user_stats')
        .update({ kanji_learned: (supabase as any).raw('kanji_learned + 1') })
        .eq('user_id', user.id);

      // Simpler approach: read then write
      const { data: s } = await supabase.from('user_stats').select('kanji_learned').eq('user_id', user.id).maybeSingle();
      await supabase.from('user_stats').update({ kanji_learned: (s?.kanji_learned ?? 0) + 1 }).eq('user_id', user.id);
    }

    return NextResponse.json({ success: true, progress: data });
  } catch (err) {
    console.error('[API kanji] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/progress/kanji — fetch all kanji progress
export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('kanji_progress')
      .select('kanji_id, status, writing_accuracy, recognition_accuracy, last_practiced_at')
      .eq('user_id', user.id)
      .order('last_practiced_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Failed to fetch kanji progress' }, { status: 500 });

    return NextResponse.json({ kanji: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
