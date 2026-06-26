-- ================================================================
-- Learn with Velmorth — Supabase PostgreSQL Schema
-- Velmorth Labs | Run this in Supabase SQL Editor
-- ================================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- 1. PROFILES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  bio           TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- Allow public read for leaderboard / social features (username + display_name only)
CREATE POLICY "Public can view profiles"     ON public.profiles FOR SELECT USING (true);

-- ================================================================
-- 2. USER SETTINGS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  ui_language           TEXT NOT NULL DEFAULT 'en',
  tts_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  goal_minutes          INT NOT NULL DEFAULT 10,
  notifications         BOOLEAN NOT NULL DEFAULT TRUE,
  jlpt_target           TEXT NOT NULL DEFAULT 'N5' CHECK (jlpt_target IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  heart_system_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  heart_recovery_mode   TEXT NOT NULL DEFAULT 'time' CHECK (heart_recovery_mode IN ('time', 'watch_ad', 'gem')),
  heart_recovery_hours  INT NOT NULL DEFAULT 24,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 3. USER STATS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_total          INT NOT NULL DEFAULT 0,
  xp_today          INT NOT NULL DEFAULT 0,
  gems_balance      INT NOT NULL DEFAULT 0,
  lessons_done      INT NOT NULL DEFAULT 0,
  words_learned     INT NOT NULL DEFAULT 0,
  reviews_done      INT NOT NULL DEFAULT 0,
  kanji_learned     INT NOT NULL DEFAULT 0,
  speak_sessions    INT NOT NULL DEFAULT 0,
  hearts_total      INT NOT NULL DEFAULT 25,
  hearts_used_today INT NOT NULL DEFAULT 0,
  hearts_max        INT NOT NULL DEFAULT 25,
  hearts_recover_at TIMESTAMPTZ,
  hearts_last_debit_at TIMESTAMPTZ,
  last_active       DATE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stats_last_active ON public.user_stats(last_active);
CREATE INDEX IF NOT EXISTS idx_user_stats_xp ON public.user_stats(xp_total DESC);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own stats" ON public.user_stats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 4. USER STREAKS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak        INT NOT NULL DEFAULT 0,
  longest       INT NOT NULL DEFAULT 0,
  freeze_count  INT NOT NULL DEFAULT 0,
  last_study_at DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own streaks" ON public.user_streaks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 5. ENTITLEMENTS (Subscription / Plan)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id              TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free', 'starter', 'plus', 'pro')),
  status               TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'starter', 'plus', 'pro', 'yearly', 'cancelled')),
  hearts_limit         INT NOT NULL DEFAULT 25,
  ai_limit_daily       INT NOT NULL DEFAULT 5,
  lessons_limit_daily  INT NOT NULL DEFAULT 5,
  ads_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at            TIMESTAMPTZ,
  ends_at              TIMESTAMPTZ,
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own entitlements" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own entitlements" ON public.entitlements
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entitlements" ON public.entitlements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 6. LESSON PROGRESS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  xp_earned   INT NOT NULL DEFAULT 0,
  score       INT,
  attempts    INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON public.lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON public.lesson_progress(lesson_id);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own lesson progress" ON public.lesson_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 7. REVIEW QUEUE (Spaced Repetition)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id         TEXT NOT NULL,
  ease_factor     FLOAT NOT NULL DEFAULT 2.5,
  interval_days   INT NOT NULL DEFAULT 1,
  repetitions     INT NOT NULL DEFAULT 0,
  next_review_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_user_next ON public.review_queue(user_id, next_review_at);

ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own review queue" ON public.review_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 8. BADGES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.badges (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  condition   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert starter badges
INSERT INTO public.badges (id, name, description, icon, rarity) VALUES
  ('first_lesson',   'First Step',      'Complete your first lesson',          '🌱', 'common'),
  ('streak_3',       'On a Roll',       'Maintain a 3-day streak',             '🔥', 'common'),
  ('streak_7',       'Week Warrior',    'Maintain a 7-day streak',             '⚡', 'rare'),
  ('streak_30',      'Iron Will',       'Maintain a 30-day streak',            '💎', 'epic'),
  ('xp_100',         'XP Collector',   'Earn 100 XP',                         '⭐', 'common'),
  ('xp_1000',        'XP Hunter',      'Earn 1000 XP',                        '🏆', 'rare'),
  ('lessons_10',     'Diligent Learner','Complete 10 lessons',                 '📚', 'common'),
  ('words_50',       'Vocabulary Builder','Learn 50 words',                    '🈶', 'rare'),
  ('review_master',  'Review Master',  'Complete 100 reviews',                 '🎴', 'epic'),
  ('speak_first',    'First Words',    'Complete your first speak session',    '🗣️', 'common')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view badges" ON public.badges FOR SELECT USING (true);

-- ================================================================
-- 9. USER BADGES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL REFERENCES public.badges(id),
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON public.user_badges
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert badges" ON public.user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 10. JLPT PROGRESS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.jlpt_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level       TEXT NOT NULL CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  category    TEXT NOT NULL,
  question_id TEXT NOT NULL,
  correct     BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_jlpt_progress_user_level ON public.jlpt_progress(user_id, level);

ALTER TABLE public.jlpt_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own JLPT progress" ON public.jlpt_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 11. ADMIN ROLES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'moderator')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
-- Only admins can read the admin_roles table
CREATE POLICY "Admins can view admin roles" ON public.admin_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- 12. MODERATION REPORTS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id),
  target_type   TEXT NOT NULL DEFAULT 'user' CHECK (target_type IN ('user', 'content', 'chat', 'other')),
  target_id     TEXT,
  reason        TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by   UUID REFERENCES auth.users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON public.moderation_reports(status);

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON public.moderation_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.moderation_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
CREATE POLICY "Admins can update reports" ON public.moderation_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- 13. ACTIVITY LOGS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity" ON public.activity_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 14. ADMIN AUDIT LOGS (admin-only actions log)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON public.admin_audit_logs(admin_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );
CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- 15. AI CHAT MESSAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user ON public.ai_chat_messages(user_id, created_at DESC);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own chat messages" ON public.ai_chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 16. USER LEARNED WORDS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_learned_words (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id         TEXT NOT NULL,            -- matches 'id' field in JSON files
  quiz_eligible   BOOLEAN DEFAULT TRUE,     -- false while being learned, true once taught
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  learn_count     INTEGER DEFAULT 1,        -- how many times this word has been studied
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

ALTER TABLE public.user_learned_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own learned words" ON public.user_learned_words
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_learned_words_user ON public.user_learned_words(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_words_user_quiz ON public.user_learned_words(user_id, quiz_eligible);

-- ================================================================
-- 17. USAGE COUNTERS (for daily limits check)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_requests     INT NOT NULL DEFAULT 0,
  lessons_started INT NOT NULL DEFAULT 0,
  hearts_used     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own usage counters" ON public.usage_counters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- 18. USAGE LOG (historical usage)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.usage_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,           -- 'heart_lost', 'gem_spent', 'lesson_done', 'ai_call', 'vocab_learned'
  amount          INTEGER DEFAULT 1,
  balance_after   INTEGER,                 -- optional: balance after event
  metadata        JSONB,                  -- extra context (e.g., lesson_id, word_id)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage log" ON public.usage_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage log" ON public.usage_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_log_user ON public.usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_type ON public.usage_log(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON public.usage_log(created_at DESC);

-- ================================================================
-- 19. RPC: increment_daily_usage
-- ================================================================
CREATE OR REPLACE FUNCTION public.increment_daily_usage(p_user_id UUID, p_counter TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_counter = 'ai_requests' THEN
    INSERT INTO public.usage_counters (user_id, date, ai_requests)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, date)
    DO UPDATE SET ai_requests = public.usage_counters.ai_requests + 1;
  ELSIF p_counter = 'lessons_started' THEN
    INSERT INTO public.usage_counters (user_id, date, lessons_started)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, date)
    DO UPDATE SET lessons_started = public.usage_counters.lessons_started + 1;
  ELSIF p_counter = 'hearts_used' THEN
    INSERT INTO public.usage_counters (user_id, date, hearts_used)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, date)
    DO UPDATE SET hearts_used = public.usage_counters.hearts_used + 1;
  END IF;
END;
$$;

-- ================================================================
-- TRIGGERS — Auto-create records on signup
-- ================================================================

-- Function to create user records on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || substring(NEW.id::text, 1, 4)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Settings
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Stats
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Streaks
  INSERT INTO public.user_streaks (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Entitlements (default free plan)
  INSERT INTO public.entitlements (user_id, plan_id, status, hearts_limit, ai_limit_daily, lessons_limit_daily, ads_enabled)
  VALUES (NEW.id, 'free', 'free', 25, 5, 5, TRUE)
  ON CONFLICT (user_id) DO NOTHING;

  -- Auto-grant admin to manish63018@gmail.com
  IF NEW.email = 'manish63018@gmail.com' THEN
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- VERIFY SETUP
-- ================================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

