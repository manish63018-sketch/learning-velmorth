import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// PATCH /api/progress/vocab
// Upsert vocabulary progress for a word (SRS review result)
// Body: { wordId, quality (0-5), markLearned?, bookmarked?, difficult? }
// ================================================================

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { wordId, quality, markLearned, bookmarked, difficult } = body;

    if (!wordId) return NextResponse.json({ error: 'wordId is required' }, { status: 400 });

    // Fetch existing record
    const { data: existing } = await supabase
      .from('vocab_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .maybeSingle();

    const updateData: Record<string, unknown> = {
      user_id: user.id,
      word_id: wordId,
      updated_at: new Date().toISOString(),
    };

    // SM-2 update if quality provided
    if (typeof quality === 'number') {
      const wasCorrect = quality >= 3;
      const curStage = existing?.srs_stage ?? 0;
      const curEase = existing?.ease_factor ?? 2.5;
      const curInterval = existing?.interval_days ?? 1;
      const curReps = existing?.review_count ?? 0;

      // SM-2 calculation
      let newInterval: number;
      let newEase = Math.max(1.3, curEase + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

      if (quality < 3) {
        newInterval = 1;
        newEase = Math.max(1.3, curEase - 0.2);
      } else if (curReps === 0) {
        newInterval = 1;
      } else if (curReps === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(curInterval * newEase);
      }

      const newStage = quality < 3 ? Math.max(0, curStage - 1) : Math.min(8, curStage + 1);
      const newStatus = quality < 3 ? 'difficult'
        : newStage <= 2 ? 'learning'
        : newStage <= 5 ? 'learned'
        : 'mastered';

      updateData.review_count = (existing?.review_count ?? 0) + 1;
      updateData.correct_count = (existing?.correct_count ?? 0) + (wasCorrect ? 1 : 0);
      updateData.incorrect_count = (existing?.incorrect_count ?? 0) + (!wasCorrect ? 1 : 0);
      updateData.srs_stage = newStage;
      updateData.ease_factor = newEase;
      updateData.interval_days = newInterval;
      updateData.next_review_at = new Date(Date.now() + newInterval * 86400000).toISOString();
      updateData.last_reviewed_at = new Date().toISOString();
      updateData.status = newStatus;
      if (newStatus === 'mastered' && !existing?.mastered_at) {
        updateData.mastered_at = new Date().toISOString();
      }
    }

    if (typeof bookmarked === 'boolean') updateData.is_bookmarked = bookmarked;
    if (difficult === true) updateData.status = 'difficult';
    if (markLearned === true && !existing) {
      updateData.status = 'learning';
      updateData.srs_stage = 1;
      updateData.next_review_at = new Date(Date.now() + 86400000).toISOString();
    }

    const { data, error } = await supabase
      .from('vocab_progress')
      .upsert(updateData, { onConflict: 'user_id,word_id' })
      .select()
      .single();

    if (error) {
      console.error('[API vocab] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to update vocabulary progress' }, { status: 500 });
    }

    return NextResponse.json({ success: true, progress: data });
  } catch (err) {
    console.error('[API vocab] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/progress/vocab?status=due|bookmarked|all
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
    const filter = searchParams.get('status') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    let query = supabase
      .from('vocab_progress')
      .select('word_id, status, srs_stage, next_review_at, review_count, is_bookmarked, correct_count, incorrect_count')
      .eq('user_id', user.id)
      .limit(limit);

    if (filter === 'due') {
      query = query.lte('next_review_at', new Date().toISOString()).order('next_review_at');
    } else if (filter === 'bookmarked') {
      query = query.eq('is_bookmarked', true);
    } else if (filter === 'difficult') {
      query = query.eq('status', 'difficult');
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to fetch vocab progress' }, { status: 500 });

    return NextResponse.json({ words: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
