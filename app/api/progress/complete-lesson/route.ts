import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ================================================================
// POST /api/progress/complete-lesson
// Atomically completes a lesson: saves progress, XP, streak, achievements.
// Body: { lessonId, score, xp, timeSeconds, wordsCount, wordIds?, metadata? }
// ================================================================

export async function POST(req: NextRequest) {
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
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { lessonId, score, xp, timeSeconds = 0, wordsCount = 0, metadata = {} } = body;

    if (!lessonId || typeof score !== 'number' || typeof xp !== 'number') {
      return NextResponse.json({ error: 'Missing required fields: lessonId, score, xp' }, { status: 400 });
    }

    if (score < 0 || score > 100) {
      return NextResponse.json({ error: 'Score must be between 0 and 100' }, { status: 400 });
    }

    if (xp < 0 || xp > 500) {
      return NextResponse.json({ error: 'XP amount out of valid range' }, { status: 400 });
    }

    // Use server-side admin client to bypass RLS for the RPC call
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await adminSupabase.rpc('rpc_complete_lesson', {
      p_user_id:     user.id,
      p_lesson_id:   lessonId,
      p_score:       Math.round(score),
      p_xp:          Math.round(xp),
      p_time_secs:   Math.round(timeSeconds),
      p_words_count: Math.round(wordsCount),
      p_metadata:    metadata,
    });

    if (error) {
      console.error('[API complete-lesson] RPC error:', error);
      return NextResponse.json({ error: 'Failed to save lesson progress' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      result: data,
    });
  } catch (err) {
    console.error('[API complete-lesson] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
