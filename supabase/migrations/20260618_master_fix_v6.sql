-- ============================================================
-- Learn with Velmorth — Supabase Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. user_learned_words ─────────────────────────────────────
-- Tracks which vocabulary words each user has been taught.
-- RULE: Only words present here with quiz_eligible = true can be tested.
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

-- RLS for user_learned_words
ALTER TABLE public.user_learned_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own learned words" ON public.user_learned_words;
CREATE POLICY "Users can view their own learned words"
  ON public.user_learned_words FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own learned words" ON public.user_learned_words;
CREATE POLICY "Users can insert their own learned words"
  ON public.user_learned_words FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own learned words" ON public.user_learned_words;
CREATE POLICY "Users can update their own learned words"
  ON public.user_learned_words FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_learned_words_user ON public.user_learned_words(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_words_user_quiz ON public.user_learned_words(user_id, quiz_eligible);


-- ── 2. review_queue ──────────────────────────────────────────
-- SM-2 Spaced Repetition queue. Supplements local SRS state.
CREATE TABLE IF NOT EXISTS public.review_queue (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id         TEXT NOT NULL,
  next_review_at  TIMESTAMPTZ DEFAULT NOW(),
  interval_days   INTEGER DEFAULT 1,
  ease_factor     FLOAT DEFAULT 2.5,
  fail_count      INTEGER DEFAULT 0,
  last_reviewed   TIMESTAMPTZ,
  UNIQUE(user_id, word_id)
);

ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own review queue" ON public.review_queue;
CREATE POLICY "Users can manage their own review queue"
  ON public.review_queue FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_due ON public.review_queue(user_id, next_review_at);


-- ── 3. admin_audit_logs ───────────────────────────────────────
-- Records all admin actions for accountability.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,           -- e.g., 'grant_pro', 'suspend_user', 'update_flag'
  target_type     TEXT,                    -- e.g., 'user', 'feature_flag', 'plan'
  target_id       TEXT,                    -- e.g., user UUID or flag key
  before_value    JSONB,
  after_value     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs (via service role or admin role check)
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON public.admin_audit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid())
  );

-- Only service role (server-side) or admins can insert
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.admin_audit_logs(created_at DESC);


-- ── 4. usage_log ─────────────────────────────────────────────
-- Tracks hearts used, gems spent, lessons started, AI calls, etc.
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

DROP POLICY IF EXISTS "Users can view their own usage log" ON public.usage_log;
CREATE POLICY "Users can view their own usage log"
  ON public.usage_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own usage log" ON public.usage_log;
CREATE POLICY "Users can insert their own usage log"
  ON public.usage_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_log_user ON public.usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_type ON public.usage_log(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON public.usage_log(created_at DESC);


-- ── 5. ai_chat_messages (if not exists) ──────────────────────
-- Stores AI tutor conversation history per user.
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  model           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own chat messages" ON public.ai_chat_messages;
CREATE POLICY "Users can manage their own chat messages"
  ON public.ai_chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON public.ai_chat_messages(user_id, created_at DESC);


-- ── 6. admin_roles (ensure exists) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role    TEXT NOT NULL DEFAULT 'admin'    -- 'admin' | 'super_admin' | 'moderator'
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Only existing admins can read/modify admin_roles
DROP POLICY IF EXISTS "Admins can read admin_roles" ON public.admin_roles;
CREATE POLICY "Admins can read admin_roles"
  ON public.admin_roles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid()));


-- ── 7. Auto-grant admin to manish63018@gmail.com ─────────────
-- Trigger: when a new user signs up with this email, auto-insert into admin_roles.
CREATE OR REPLACE FUNCTION public.handle_new_user_admin_check()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email = 'manish63018@gmail.com' THEN
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_admin_check ON auth.users;

CREATE TRIGGER on_auth_user_created_admin_check
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin_check();

-- ── Also grant admin to existing user (manish63018@gmail.com) ─
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'manish63018@gmail.com'
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (admin_user_id, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
    RAISE NOTICE 'Admin granted to manish63018@gmail.com (user_id: %)', admin_user_id;
  ELSE
    RAISE NOTICE 'User manish63018@gmail.com not found — will be granted admin on signup via trigger.';
  END IF;
END $$;


-- ── 8. Verify existing tables (no-op if already correct) ─────
-- Ensure user_stats has hearts columns
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS hearts_total INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hearts_used_today INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hearts_max INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hearts_recover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hearts_last_debit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kanji_learned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speak_sessions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS words_learned INTEGER DEFAULT 0;

-- Ensure user_settings has all required columns
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS heart_system_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS heart_recovery_mode TEXT DEFAULT 'time',
  ADD COLUMN IF NOT EXISTS heart_recovery_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS jlpt_target TEXT DEFAULT 'N5';

-- ─────────────────────────────────────────────────────────────
-- DONE — All tables created, policies set, admin trigger installed.
-- ─────────────────────────────────────────────────────────────
