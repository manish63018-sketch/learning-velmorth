import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// PATCH /api/progress/grammar
// Save grammar point quiz score and revision status
// Body: { grammarId, lessonId?, jlptLevel?, score, isCompleted }
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
    const { grammarId, lessonId, jlptLevel, score, isCompleted } = body;

    if (!grammarId || typeof score !== 'number') {
      return NextResponse.json({ error: 'grammarId and score are required' }, { status: 400 });
    }

    if (score < 0 || score > 100) {
      return NextResponse.json({ error: 'Score must be between 0 and 100' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('grammar_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('grammar_id', grammarId)
      .maybeSingle();

    const isFirstCompletion = !existing;
    const newStatus = score >= 70 ? 'completed' : score >= 40 ? 'learning' : 'needs_revision';
    const wasAlreadyCompleted = existing?.status === 'completed';

    const upsertData = {
      user_id: user.id,
      grammar_id: grammarId,
      lesson_id: lessonId ?? existing?.lesson_id ?? null,
      jlpt_level: jlptLevel ?? existing?.jlpt_level ?? null,
      quiz_attempts: (existing?.quiz_attempts ?? 0) + 1,
      quiz_correct: (existing?.quiz_correct ?? 0) + (score >= 70 ? 1 : 0),
      best_score: Math.max(existing?.best_score ?? 0, score),
      last_score: score,
      status: isCompleted ? 'completed' : newStatus,
      needs_revision: score < 70,
      completed_at: (isCompleted || score >= 70) && !wasAlreadyCompleted
        ? new Date().toISOString()
        : existing?.completed_at ?? null,
      last_practiced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('grammar_progress')
      .upsert(upsertData, { onConflict: 'user_id,grammar_id' })
      .select()
      .single();

    if (error) {
      console.error('[API grammar] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to update grammar progress' }, { status: 500 });
    }

    // Increment grammar_learned on first completion
    if (isFirstCompletion && (isCompleted || score >= 70)) {
      const { data: s } = await supabase
        .from('user_stats')
        .select('grammar_learned')
        .eq('user_id', user.id)
        .maybeSingle();
      await supabase
        .from('user_stats')
        .update({ grammar_learned: (s?.grammar_learned ?? 0) + 1 })
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true, progress: data, isFirstCompletion });
  } catch (err) {
    console.error('[API grammar] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/progress/grammar?level=N5
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

    const { searchParams } = new URL(req.url);
    const level = searchParams.get('level');

    let query = supabase
      .from('grammar_progress')
      .select('grammar_id, jlpt_level, status, best_score, last_score, needs_revision, completed_at')
      .eq('user_id', user.id)
      .order('last_practiced_at', { ascending: false });

    if (level) query = query.eq('jlpt_level', level);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to fetch grammar progress' }, { status: 500 });

    return NextResponse.json({ grammar: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
