-- ================================================================
-- Learn with Velmorth — Japanese Writing Practice System Database Schema
-- Migration: 20260624_writing_practice_system.sql
-- ================================================================

-- 1. WRITING HISTORY
CREATE TABLE IF NOT EXISTS public.writing_history (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  char_id             TEXT NOT NULL,            -- e.g. 'あ', 'ア', '漢'
  char_type           TEXT NOT NULL CHECK (char_type IN ('hiragana', 'katakana', 'kanji')),
  level               TEXT NOT NULL,            -- 'basic', 'N5', 'N4', 'N3', 'N2', 'N1'
  accuracy_score      INT NOT NULL CHECK (accuracy_score >= 0 AND accuracy_score <= 100),
  stroke_order_score  INT NOT NULL CHECK (stroke_order_score >= 0 AND stroke_order_score <= 100),
  shape_score         INT NOT NULL CHECK (shape_score >= 0 AND shape_score <= 100),
  proportion_score    INT NOT NULL CHECK (proportion_score >= 0 AND proportion_score <= 100),
  suggestions         TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_writing_history_user ON public.writing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_history_char ON public.writing_history(char_id);
CREATE INDEX IF NOT EXISTS idx_writing_history_created_at ON public.writing_history(created_at DESC);

ALTER TABLE public.writing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own writing history" ON public.writing_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. WRITING MASTERY
CREATE TABLE IF NOT EXISTS public.writing_mastery (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  char_id             TEXT NOT NULL,
  char_type           TEXT NOT NULL CHECK (char_type IN ('hiragana', 'katakana', 'kanji')),
  level               TEXT NOT NULL,            -- 'basic', 'N5', 'N4', 'N3', 'N2', 'N1'
  mastery_level       INT NOT NULL DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 5), -- 0 to 5 (Mastered)
  attempts            INT NOT NULL DEFAULT 0,
  last_score          INT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, char_id)
);

CREATE INDEX IF NOT EXISTS idx_writing_mastery_user ON public.writing_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_mastery_mastery ON public.writing_mastery(user_id, mastery_level);

ALTER TABLE public.writing_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own writing mastery" ON public.writing_mastery
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. ACHIEVEMENTS BADGES
-- Insert writing mastery badge
INSERT INTO public.badges (id, name, description, icon, rarity)
VALUES (
  'writing_master_10',
  'Calligrapher',
  'Write 10 characters perfectly (100% score)',
  '🖌️',
  'rare'
)
ON CONFLICT (id) DO NOTHING;
