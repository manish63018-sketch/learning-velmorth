-- ================================================================
-- Learn with Velmorth — Progress System Migration
-- Migration: 001_progress_system.sql
-- Run this in Supabase SQL Editor AFTER the base schema.sql
-- ================================================================

-- ================================================================
-- 1. VOCABULARY PROGRESS (per-word granular tracking)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.vocab_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id         TEXT NOT NULL,
  -- Status lifecycle: new → learning → learned → mastered
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'learned', 'mastered', 'difficult')),
  is_bookmarked   BOOLEAN NOT NULL DEFAULT FALSE,
  review_count    INT NOT NULL DEFAULT 0,
  correct_count   INT NOT NULL DEFAULT 0,
  incorrect_count INT NOT NULL DEFAULT 0,
  -- SM-2 Spaced Repetition fields
  srs_stage       INT NOT NULL DEFAULT 0,       -- 0=new, 1-8=learning stages
  ease_factor     FLOAT NOT NULL DEFAULT 2.5,
  interval_days   INT NOT NULL DEFAULT 1,
  next_review_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mastered_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_progress_user ON public.vocab_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_user_status ON public.vocab_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_next_review ON public.vocab_progress(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_bookmarked ON public.vocab_progress(user_id, is_bookmarked) WHERE is_bookmarked = TRUE;

ALTER TABLE public.vocab_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own vocab progress" ON public.vocab_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 2. KANJI PROGRESS (writing, stroke, recognition tracking)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.kanji_progress (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kanji_id             TEXT NOT NULL,             -- The kanji character or ID, e.g. '水' or 'kanji_001'
  -- Writing practice
  writing_attempts     INT NOT NULL DEFAULT 0,
  writing_correct      INT NOT NULL DEFAULT 0,
  stroke_attempts      INT NOT NULL DEFAULT 0,
  stroke_correct       INT NOT NULL DEFAULT 0,
  -- Recognition
  recognition_attempts INT NOT NULL DEFAULT 0,
  recognition_correct  INT NOT NULL DEFAULT 0,
  -- Computed accuracy (0.0–1.0)
  writing_accuracy     FLOAT GENERATED ALWAYS AS (
    CASE WHEN writing_attempts > 0 THEN writing_correct::FLOAT / writing_attempts ELSE 0 END
  ) STORED,
  recognition_accuracy FLOAT GENERATED ALWAYS AS (
    CASE WHEN recognition_attempts > 0 THEN recognition_correct::FLOAT / recognition_attempts ELSE 0 END
  ) STORED,
  -- Status
  status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'learned', 'mastered')),
  last_practiced_at    TIMESTAMPTZ,
  mastered_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kanji_id)
);

CREATE INDEX IF NOT EXISTS idx_kanji_progress_user ON public.kanji_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_kanji_progress_user_status ON public.kanji_progress(user_id, status);

ALTER TABLE public.kanji_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own kanji progress" ON public.kanji_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 3. GRAMMAR PROGRESS (per-grammar-point tracking)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.grammar_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grammar_id      TEXT NOT NULL,       -- e.g. 'ja_grammar_wa_particle' or lesson_id
  lesson_id       TEXT,                -- nullable: link to lesson
  jlpt_level      TEXT CHECK (jlpt_level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  -- Quiz tracking
  quiz_attempts   INT NOT NULL DEFAULT 0,
  quiz_correct    INT NOT NULL DEFAULT 0,
  best_score      INT NOT NULL DEFAULT 0,  -- 0–100 percentage
  last_score      INT NOT NULL DEFAULT 0,
  -- Status
  status          TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'learning', 'completed', 'needs_revision')),
  needs_revision  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  last_practiced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, grammar_id)
);

CREATE INDEX IF NOT EXISTS idx_grammar_progress_user ON public.grammar_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_grammar_progress_user_level ON public.grammar_progress(user_id, jlpt_level);
CREATE INDEX IF NOT EXISTS idx_grammar_progress_status ON public.grammar_progress(user_id, status);

ALTER TABLE public.grammar_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own grammar progress" ON public.grammar_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 4. XP EVENTS (immutable event log — the source of truth for XP)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.xp_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Event types
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'lesson_complete',
    'quiz_complete',
    'daily_bonus',
    'streak_bonus',
    'achievement_unlock',
    'review_complete',
    'vocab_mastered',
    'kanji_mastered',
    'grammar_complete',
    'first_lesson',
    'admin_grant'
  )),
  xp_amount   INT NOT NULL CHECK (xp_amount > 0),
  -- Contextual references
  lesson_id   TEXT,
  word_id     TEXT,
  badge_id    TEXT,
  metadata    JSONB DEFAULT '{}',
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user ON public.xp_events(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_events_type ON public.xp_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_xp_events_date ON public.xp_events(user_id, ((earned_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own xp events" ON public.xp_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own xp events" ON public.xp_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 5. DAILY ACTIVITY (per-day summary — powers heatmap + streaks)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.daily_activity (
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  xp_earned         INT NOT NULL DEFAULT 0,
  lessons_completed INT NOT NULL DEFAULT 0,
  words_reviewed    INT NOT NULL DEFAULT 0,
  kanji_practiced   INT NOT NULL DEFAULT 0,
  grammar_practiced INT NOT NULL DEFAULT 0,
  streak_extended   BOOLEAN NOT NULL DEFAULT FALSE,
  goal_met          BOOLEAN NOT NULL DEFAULT FALSE,
  study_minutes     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user ON public.daily_activity(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON public.daily_activity(activity_date);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own daily activity" ON public.daily_activity
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 6. LESSON PROGRESS — extend with more fields
-- ================================================================
ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS completion_percentage INT NOT NULL DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS time_spent_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS words_learned_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_score BOOLEAN NOT NULL DEFAULT FALSE;

-- ================================================================
-- 7. USER STATS — add grammar_learned field
-- ================================================================
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS grammar_learned INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jlpt_readiness JSONB DEFAULT '{}';
  -- jlpt_readiness shape: { "N5": 45, "N4": 12, "N3": 0, "N2": 0, "N1": 0 } (percentages)

-- ================================================================
-- 8. BADGES — add new achievement badges
-- ================================================================
INSERT INTO public.badges (id, name, description, icon, rarity) VALUES
  ('words_100',    'Word Centurion',     'Learn 100 words',             '💯', 'rare'),
  ('words_500',    'Vocabulary Master',  'Learn 500 words',             '📖', 'epic'),
  ('xp_1000_v2',   '1K XP Club',         'Earn 1,000 XP',               '⭐', 'rare'),
  ('xp_5000',      'XP Legend',          'Earn 5,000 XP',               '🌟', 'epic'),
  ('n5_complete',  'N5 Graduate',        'Complete all N5 lessons',     '🎌', 'epic'),
  ('n4_complete',  'N4 Graduate',        'Complete all N4 lessons',     '🏯', 'epic'),
  ('n3_complete',  'N3 Graduate',        'Complete all N3 lessons',     '⛩️', 'legendary'),
  ('n2_complete',  'N2 Graduate',        'Complete all N2 lessons',     '🗾', 'legendary'),
  ('n1_complete',  'N1 Master',          'Complete all N1 lessons',     '👘', 'legendary'),
  ('kanji_first',  'First Stroke',       'Practice your first kanji',   '✒️', 'common'),
  ('kanji_50',     'Kanji Apprentice',   'Practice 50 kanji',           '🔤', 'rare'),
  ('grammar_first','Grammar Explorer',   'Complete first grammar point', '📝', 'common'),
  ('perfect_10',   'Perfect 10',         'Get a perfect score 10 times', '💎', 'rare'),
  ('streak_14',    'Two-Week Champion',  'Maintain a 14-day streak',    '🔥', 'rare'),
  ('streak_100',   'Century Streak',     'Maintain a 100-day streak',   '🏆', 'legendary')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- 9. RPC: rpc_award_xp — atomic XP award + event log
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_award_xp(
  p_user_id    UUID,
  p_amount     INT,
  p_event_type TEXT,
  p_lesson_id  TEXT DEFAULT NULL,
  p_word_id    TEXT DEFAULT NULL,
  p_badge_id   TEXT DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'
)
RETURNS INT  -- returns new total XP
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_xp       INT;
  v_today        DATE := CURRENT_DATE;
BEGIN
  -- Insert XP event (immutable log)
  INSERT INTO public.xp_events (user_id, event_type, xp_amount, lesson_id, word_id, badge_id, metadata)
  VALUES (p_user_id, p_event_type, p_amount, p_lesson_id, p_word_id, p_badge_id, p_metadata);

  -- Update user_stats (total XP + today's XP)
  INSERT INTO public.user_stats (user_id, xp_total, xp_today, last_active)
  VALUES (p_user_id, p_amount, p_amount, v_today)
  ON CONFLICT (user_id) DO UPDATE SET
    xp_total   = public.user_stats.xp_total + p_amount,
    xp_today   = CASE
                   WHEN public.user_stats.last_active = v_today
                   THEN public.user_stats.xp_today + p_amount
                   ELSE p_amount
                 END,
    last_active = v_today,
    updated_at  = NOW()
  RETURNING xp_total INTO v_new_xp;

  -- Upsert daily_activity
  INSERT INTO public.daily_activity (user_id, activity_date, xp_earned)
  VALUES (p_user_id, v_today, p_amount)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    xp_earned  = public.daily_activity.xp_earned + p_amount,
    updated_at = NOW();

  RETURN v_new_xp;
END;
$$;

-- ================================================================
-- 10. RPC: rpc_update_streak — idempotent daily streak update
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_streak(p_user_id UUID)
RETURNS JSONB  -- returns { streak, longest, already_extended }
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_streak        INT;
  v_longest       INT;
  v_last_study    DATE;
  v_today         DATE := CURRENT_DATE;
  v_yesterday     DATE := CURRENT_DATE - INTERVAL '1 day';
  v_already_done  BOOLEAN := FALSE;
  v_freeze_count  INT;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT streak, longest, last_study_at, freeze_count
  INTO v_streak, v_longest, v_last_study, v_freeze_count
  FROM public.user_streaks
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Row might not exist for new users
  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, streak, longest, freeze_count, last_study_at)
    VALUES (p_user_id, 1, 1, 0, v_today);
    -- Mark daily_activity streak extended
    INSERT INTO public.daily_activity (user_id, activity_date, streak_extended)
    VALUES (p_user_id, v_today, TRUE)
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
      streak_extended = TRUE, updated_at = NOW();
    RETURN jsonb_build_object('streak', 1, 'longest', 1, 'already_extended', FALSE);
  END IF;

  -- Already extended today — idempotent
  IF v_last_study = v_today THEN
    RETURN jsonb_build_object('streak', v_streak, 'longest', v_longest, 'already_extended', TRUE);
  END IF;

  -- Check continuity
  IF v_last_study = v_yesterday THEN
    -- Normal streak continuation
    v_streak := v_streak + 1;
  ELSIF v_last_study < v_yesterday AND v_freeze_count > 0 THEN
    -- Use a streak freeze
    v_streak := v_streak + 1;
    v_freeze_count := v_freeze_count - 1;
  ELSIF v_last_study IS NULL OR v_last_study < v_yesterday THEN
    -- Streak broken — restart
    v_streak := 1;
  END IF;

  -- Update longest
  v_longest := GREATEST(v_longest, v_streak);

  -- Persist
  UPDATE public.user_streaks SET
    streak       = v_streak,
    longest      = v_longest,
    freeze_count = v_freeze_count,
    last_study_at = v_today,
    updated_at   = NOW()
  WHERE user_id = p_user_id;

  -- Mark daily_activity
  INSERT INTO public.daily_activity (user_id, activity_date, streak_extended)
  VALUES (p_user_id, v_today, TRUE)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    streak_extended = TRUE, updated_at = NOW();

  RETURN jsonb_build_object('streak', v_streak, 'longest', v_longest, 'already_extended', FALSE);
END;
$$;

-- ================================================================
-- 11. RPC: rpc_complete_lesson — atomic lesson completion transaction
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_complete_lesson(
  p_user_id     UUID,
  p_lesson_id   TEXT,
  p_score       INT,          -- 0–100
  p_xp          INT,
  p_time_secs   INT DEFAULT 0,
  p_words_count INT DEFAULT 0,
  p_metadata    JSONB DEFAULT '{}'
)
RETURNS JSONB  -- returns { xp_total, streak, longest, newly_unlocked_badges[] }
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_xp        INT;
  v_streak_result JSONB;
  v_is_perfect    BOOLEAN := (p_score >= 100);
  v_today         DATE := CURRENT_DATE;
  v_badges        JSONB := '[]';
BEGIN
  -- 1. Upsert lesson_progress
  INSERT INTO public.lesson_progress (
    user_id, lesson_id, status, xp_earned, score, attempts,
    completion_percentage, time_spent_seconds, last_visited_at,
    words_learned_count, perfect_score, completed_at
  ) VALUES (
    p_user_id, p_lesson_id, 'completed', p_xp, p_score, 1,
    100, p_time_secs, NOW(),
    p_words_count, v_is_perfect, NOW()
  )
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    status               = 'completed',
    xp_earned            = GREATEST(public.lesson_progress.xp_earned, p_xp),
    score                = GREATEST(COALESCE(public.lesson_progress.score, 0), p_score),
    attempts             = public.lesson_progress.attempts + 1,
    completion_percentage = 100,
    time_spent_seconds   = public.lesson_progress.time_spent_seconds + p_time_secs,
    last_visited_at      = NOW(),
    words_learned_count  = GREATEST(public.lesson_progress.words_learned_count, p_words_count),
    perfect_score        = public.lesson_progress.perfect_score OR v_is_perfect,
    completed_at         = COALESCE(public.lesson_progress.completed_at, NOW()),
    updated_at           = NOW();

  -- 2. Award XP (creates xp_event + updates user_stats + daily_activity)
  SELECT public.rpc_award_xp(
    p_user_id, p_xp, 'lesson_complete',
    p_lesson_id, NULL, NULL, p_metadata
  ) INTO v_new_xp;

  -- 3. Update streak (idempotent)
  SELECT public.rpc_update_streak(p_user_id) INTO v_streak_result;

  -- 4. Award streak bonus XP if streak was just extended
  IF NOT (v_streak_result->>'already_extended')::BOOLEAN THEN
    DECLARE v_streak_bonus INT := LEAST(5 * (v_streak_result->>'streak')::INT, 50);
    BEGIN
      PERFORM public.rpc_award_xp(
        p_user_id, v_streak_bonus, 'streak_bonus',
        NULL, NULL, NULL,
        jsonb_build_object('streak_day', v_streak_result->>'streak')
      );
      v_new_xp := v_new_xp + v_streak_bonus;
    END;
  END IF;

  -- 5. Increment stats counters
  UPDATE public.user_stats SET
    lessons_done  = lessons_done + 1,
    words_learned = words_learned + p_words_count,
    updated_at    = NOW()
  WHERE user_id = p_user_id;

  -- 6. Increment daily_activity lessons count
  INSERT INTO public.daily_activity (user_id, activity_date, lessons_completed, words_reviewed)
  VALUES (p_user_id, v_today, 1, p_words_count)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    lessons_completed = public.daily_activity.lessons_completed + 1,
    words_reviewed    = public.daily_activity.words_reviewed + p_words_count,
    updated_at        = NOW();

  -- 7. Check and award badges
  SELECT public.rpc_check_achievements(p_user_id) INTO v_badges;

  RETURN jsonb_build_object(
    'xp_total',             v_new_xp,
    'streak',               (v_streak_result->>'streak')::INT,
    'longest',              (v_streak_result->>'longest')::INT,
    'streak_already_done',  (v_streak_result->>'already_extended')::BOOLEAN,
    'newly_unlocked_badges', v_badges
  );
END;
$$;

-- ================================================================
-- 12. RPC: rpc_check_achievements — award all unearned badges
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_check_achievements(p_user_id UUID)
RETURNS JSONB  -- array of newly awarded badge IDs
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stats        RECORD;
  v_streaks      RECORD;
  v_new_badges   TEXT[] := ARRAY[]::TEXT[];
  v_badge_id     TEXT;
  v_lessons_done INT;
  v_perfect_10   INT;
BEGIN
  -- Fetch current stats
  SELECT * INTO v_stats FROM public.user_stats WHERE user_id = p_user_id;
  SELECT * INTO v_streaks FROM public.user_streaks WHERE user_id = p_user_id;

  -- Count completed lessons
  SELECT COUNT(*) INTO v_lessons_done FROM public.lesson_progress
  WHERE user_id = p_user_id AND status = 'completed';

  -- Count perfect scores
  SELECT COUNT(*) INTO v_perfect_10 FROM public.lesson_progress
  WHERE user_id = p_user_id AND perfect_score = TRUE;

  -- Helper: award badge if not already earned
  -- Badge conditions:
  FOREACH v_badge_id IN ARRAY ARRAY[
    CASE WHEN v_lessons_done >= 1                          THEN 'first_lesson'   END,
    CASE WHEN (v_streaks.streak >= 3)                      THEN 'streak_3'       END,
    CASE WHEN (v_streaks.streak >= 7
               OR v_streaks.longest >= 7)                  THEN 'streak_7'       END,
    CASE WHEN (v_streaks.streak >= 14
               OR v_streaks.longest >= 14)                 THEN 'streak_14'      END,
    CASE WHEN (v_streaks.streak >= 30
               OR v_streaks.longest >= 30)                 THEN 'streak_30'      END,
    CASE WHEN (v_streaks.streak >= 100
               OR v_streaks.longest >= 100)                THEN 'streak_100'     END,
    CASE WHEN v_stats.xp_total >= 100                      THEN 'xp_100'         END,
    CASE WHEN v_stats.xp_total >= 1000                     THEN 'xp_1000'        END,
    CASE WHEN v_stats.xp_total >= 1000                     THEN 'xp_1000_v2'     END,
    CASE WHEN v_stats.xp_total >= 5000                     THEN 'xp_5000'        END,
    CASE WHEN v_lessons_done >= 10                         THEN 'lessons_10'     END,
    CASE WHEN v_stats.words_learned >= 50                  THEN 'words_50'       END,
    CASE WHEN v_stats.words_learned >= 100                 THEN 'words_100'      END,
    CASE WHEN v_stats.words_learned >= 500                 THEN 'words_500'      END,
    CASE WHEN v_stats.reviews_done >= 100                  THEN 'review_master'  END,
    CASE WHEN v_perfect_10 >= 10                           THEN 'perfect_10'     END,
    CASE WHEN v_stats.kanji_learned >= 1                   THEN 'kanji_first'    END,
    CASE WHEN v_stats.kanji_learned >= 50                  THEN 'kanji_50'       END,
    CASE WHEN v_stats.grammar_learned >= 1                 THEN 'grammar_first'  END
  ] LOOP
    CONTINUE WHEN v_badge_id IS NULL;
    -- Only insert if badge exists in badges table AND not already earned
    IF EXISTS (SELECT 1 FROM public.badges WHERE id = v_badge_id) AND
       NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND badge_id = v_badge_id) THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
      v_new_badges := array_append(v_new_badges, v_badge_id);
      -- Log achievement XP
      PERFORM public.rpc_award_xp(p_user_id, 25, 'achievement_unlock', NULL, NULL, v_badge_id,
        jsonb_build_object('badge_id', v_badge_id));
    END IF;
  END LOOP;

  RETURN to_jsonb(v_new_badges);
END;
$$;

-- ================================================================
-- 13. RPC: rpc_get_dashboard — aggregate dashboard stats
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_dashboard(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stats       RECORD;
  v_streaks     RECORD;
  v_badges      INT;
  v_jlpt        JSONB;
  v_weak_areas  JSONB;
  v_heatmap     JSONB;
  v_vocab_stats JSONB;
  v_level       INT;
  v_xp_in_level INT;
  v_xp_next     INT;
  v_threshold   INT := 100;
  v_accum       INT := 0;
BEGIN
  SELECT * INTO v_stats   FROM public.user_stats   WHERE user_id = p_user_id;
  SELECT * INTO v_streaks FROM public.user_streaks WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_badges FROM public.user_badges WHERE user_id = p_user_id;

  -- Level calculation
  v_level := 1;
  LOOP
    EXIT WHEN v_stats.xp_total < v_accum + v_threshold OR v_level >= 100;
    v_accum := v_accum + v_threshold;
    v_threshold := v_threshold + 100;
    v_level := v_level + 1;
  END LOOP;
  v_xp_in_level := v_stats.xp_total - v_accum;
  v_xp_next     := v_threshold;

  -- JLPT readiness (per level: % of questions answered correctly)
  SELECT jsonb_object_agg(level, readiness) INTO v_jlpt
  FROM (
    SELECT level,
           ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) AS readiness
    FROM public.jlpt_progress
    WHERE user_id = p_user_id
    GROUP BY level
  ) t;

  -- Weak areas: grammar points needing revision or lowest accuracy
  SELECT jsonb_agg(
    jsonb_build_object(
      'grammar_id', grammar_id,
      'last_score', last_score,
      'status', status
    ) ORDER BY last_score ASC
  ) INTO v_weak_areas
  FROM public.grammar_progress
  WHERE user_id = p_user_id AND status IN ('needs_revision', 'learning')
  LIMIT 5;

  -- Heatmap: last 90 days activity
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', activity_date,
      'xp', xp_earned,
      'lessons', lessons_completed
    ) ORDER BY activity_date DESC
  ) INTO v_heatmap
  FROM public.daily_activity
  WHERE user_id = p_user_id AND activity_date >= CURRENT_DATE - INTERVAL '90 days';

  -- Vocab summary
  SELECT jsonb_build_object(
    'total',      COUNT(*),
    'new',        COUNT(*) FILTER (WHERE status = 'new'),
    'learning',   COUNT(*) FILTER (WHERE status = 'learning'),
    'learned',    COUNT(*) FILTER (WHERE status = 'learned'),
    'mastered',   COUNT(*) FILTER (WHERE status = 'mastered'),
    'difficult',  COUNT(*) FILTER (WHERE status = 'difficult'),
    'bookmarked', COUNT(*) FILTER (WHERE is_bookmarked = TRUE)
  ) INTO v_vocab_stats
  FROM public.vocab_progress
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'xp_total',       COALESCE(v_stats.xp_total, 0),
    'xp_today',       COALESCE(v_stats.xp_today, 0),
    'level',          v_level,
    'xp_in_level',    v_xp_in_level,
    'xp_next_level',  v_xp_next,
    'gems',           COALESCE(v_stats.gems_balance, 0),
    'streak',         COALESCE(v_streaks.streak, 0),
    'longest_streak', COALESCE(v_streaks.longest, 0),
    'lessons_done',   COALESCE(v_stats.lessons_done, 0),
    'words_learned',  COALESCE(v_stats.words_learned, 0),
    'kanji_learned',  COALESCE(v_stats.kanji_learned, 0),
    'grammar_learned',COALESCE(v_stats.grammar_learned, 0),
    'reviews_done',   COALESCE(v_stats.reviews_done, 0),
    'badges_earned',  v_badges,
    'jlpt_readiness', COALESCE(v_jlpt, '{}'),
    'weak_areas',     COALESCE(v_weak_areas, '[]'),
    'heatmap',        COALESCE(v_heatmap, '[]'),
    'vocab_stats',    COALESCE(v_vocab_stats, '{}')
  );
END;
$$;

-- ================================================================
-- 14. ADMIN ANALYTICS VIEW (admin-only, used by rpc_admin_analytics)
-- ================================================================
CREATE OR REPLACE FUNCTION public.rpc_admin_analytics(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Security: caller must be admin
  IF NOT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'overview', (
      SELECT jsonb_build_object(
        'total_users',       (SELECT COUNT(*) FROM public.profiles),
        'active_last_7d',    (SELECT COUNT(DISTINCT user_id) FROM public.daily_activity WHERE activity_date >= CURRENT_DATE - 7),
        'active_last_30d',   (SELECT COUNT(DISTINCT user_id) FROM public.daily_activity WHERE activity_date >= CURRENT_DATE - p_days),
        'new_users_today',   (SELECT COUNT(*) FROM auth.users WHERE created_at::date = CURRENT_DATE),
        'premium_users',     (SELECT COUNT(*) FROM public.entitlements WHERE status NOT IN ('free', 'cancelled')),
        'total_lessons_done',(SELECT SUM(lessons_done) FROM public.user_stats),
        'total_words_learned',(SELECT SUM(words_learned) FROM public.user_stats),
        'avg_streak',        (SELECT ROUND(AVG(streak)) FROM public.user_streaks WHERE streak > 0),
        'total_xp_awarded',  (SELECT SUM(xp_amount) FROM public.xp_events)
      )
    ),
    'daily_signups', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', c) ORDER BY d DESC)
      FROM (
        SELECT created_at::date AS d, COUNT(*) AS c
        FROM auth.users
        WHERE created_at >= NOW() - make_interval(days => p_days)
        GROUP BY created_at::date
      ) t
    ),
    'lesson_completions', (
      SELECT jsonb_agg(jsonb_build_object(
        'lesson_id', lesson_id,
        'completions', cnt,
        'avg_score', avg_score,
        'avg_time_secs', avg_time
      ))
      FROM (
        SELECT lesson_id,
               COUNT(*) AS cnt,
               ROUND(AVG(score)) AS avg_score,
               ROUND(AVG(time_spent_seconds)) AS avg_time
        FROM public.lesson_progress
        WHERE status = 'completed'
          AND completed_at >= NOW() - make_interval(days => p_days)
        GROUP BY lesson_id
        ORDER BY cnt DESC
        LIMIT 20
      ) t
    ),
    'xp_by_type', (
      SELECT jsonb_object_agg(event_type, total)
      FROM (
        SELECT event_type, SUM(xp_amount) AS total
        FROM public.xp_events
        WHERE earned_at >= NOW() - make_interval(days => p_days)
        GROUP BY event_type
      ) t
    ),
    'retention', (
      SELECT jsonb_build_object(
        'day1',  (
          SELECT ROUND(100.0 * COUNT(DISTINCT da.user_id) / NULLIF(COUNT(DISTINCT u.id), 0))
          FROM auth.users u
          LEFT JOIN public.daily_activity da
            ON da.user_id = u.id AND da.activity_date = u.created_at::date + 1
          WHERE u.created_at::date = CURRENT_DATE - p_days
        ),
        'day7', (
          SELECT ROUND(100.0 * COUNT(DISTINCT da.user_id) / NULLIF(COUNT(DISTINCT u.id), 0))
          FROM auth.users u
          LEFT JOIN public.daily_activity da
            ON da.user_id = u.id AND da.activity_date = u.created_at::date + 7
          WHERE u.created_at::date = CURRENT_DATE - p_days
        ),
        'day30', (
          SELECT ROUND(100.0 * COUNT(DISTINCT da.user_id) / NULLIF(COUNT(DISTINCT u.id), 0))
          FROM auth.users u
          LEFT JOIN public.daily_activity da
            ON da.user_id = u.id AND da.activity_date = u.created_at::date + 30
          WHERE u.created_at::date = CURRENT_DATE - p_days
        )
      )
    ),
    'top_learners', (
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', t.user_id,
        'username', t.username,
        'xp_total', t.xp_total,
        'streak', t.streak,
        'lessons_done', t.lessons_done
      ))
      FROM (
        SELECT s.user_id, p.username, s.xp_total, st.streak, s.lessons_done
        FROM public.user_stats s
        JOIN public.profiles p ON p.id = s.user_id
        LEFT JOIN public.user_streaks st ON st.user_id = s.user_id
        ORDER BY s.xp_total DESC
        LIMIT 10
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ================================================================
-- 15. GRANT execute on new RPCs to authenticated users
-- ================================================================
GRANT EXECUTE ON FUNCTION public.rpc_award_xp TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_streak TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_lesson TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_check_achievements TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_analytics TO authenticated;

-- Admin policies for new tables (allow admins to read all user data)
CREATE POLICY "Admins can view all vocab progress" ON public.vocab_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
CREATE POLICY "Admins can view all kanji progress" ON public.kanji_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
CREATE POLICY "Admins can view all xp events" ON public.xp_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
CREATE POLICY "Admins can view all daily activity" ON public.daily_activity
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
