-- ================================================================
-- Learn with Velmorth — Phase 8: Content Scale Architecture
-- Migration: 20260625_content_scale_architecture.sql
-- Velmorth Labs | Run in Supabase SQL Editor
-- ================================================================
-- Adds: vocabulary, kanji, grammar, sentences, dialogues,
--       courses, modules, lessons (DB-backed), quizzes,
--       flashcards, reviews, audio_files, images, videos,
--       user_progress, quiz_results, review_history,
--       announcements, analytics_events
-- ================================================================

BEGIN;

DROP TABLE IF EXISTS public.quiz_questions CASCADE;

-- ================================================================
-- CONTENT GROUP
-- ================================================================

-- ----------------------------------------------------------------
-- COURSES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id            TEXT PRIMARY KEY,                         -- e.g. 'jlpt-n5'
  title         TEXT NOT NULL,
  description   TEXT,
  language      TEXT NOT NULL DEFAULT 'ja',
  jlpt_level    TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  difficulty    INT  NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  thumbnail_url TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published courses" ON public.courses
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- MODULES (chapters inside a course)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modules (
  id          TEXT PRIMARY KEY,                           -- e.g. 'jlpt-n5-hiragana'
  course_id   TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modules_course ON public.modules(course_id);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published modules" ON public.modules
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Admins can manage modules" ON public.modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- LESSONS (DB-backed, mirrors JSON files for scalability)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lessons (
  id          TEXT PRIMARY KEY,                           -- e.g. 'jlpt-n5-hiragana-01'
  module_id   TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  lesson_type TEXT NOT NULL DEFAULT 'vocabulary'
                CHECK (lesson_type IN ('vocabulary','grammar','kanji','speaking','writing','quiz','dialogue')),
  xp_reward   INT  NOT NULL DEFAULT 10,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  content     JSONB,                                     -- optional: inline exercise definitions
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_module ON public.lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lessons_type   ON public.lessons(lesson_type);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published lessons" ON public.lessons
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Admins can manage lessons" ON public.lessons
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- VOCABULARY  (50,000+ words target)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vocabulary (
  id               BIGSERIAL PRIMARY KEY,
  jlpt_level       TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  word_japanese    TEXT NOT NULL,
  hiragana         TEXT,
  katakana         TEXT,
  romaji           TEXT,
  english          TEXT NOT NULL,
  hindi            TEXT,
  meaning          TEXT,                                 -- extended meaning / nuance
  part_of_speech   TEXT,                                 -- noun, verb, adjective…
  example_japanese TEXT,
  example_english  TEXT,
  example_hindi    TEXT,
  audio_url        TEXT,                                 -- Supabase Storage path
  difficulty       INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  tags             TEXT[] DEFAULT '{}',
  frequency_rank   INT,                                  -- lower = more frequent
  lesson_id        TEXT REFERENCES public.lessons(id),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocab_jlpt      ON public.vocabulary(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_vocab_word      ON public.vocabulary(word_japanese);
CREATE INDEX IF NOT EXISTS idx_vocab_lesson    ON public.vocabulary(lesson_id);
CREATE INDEX IF NOT EXISTS idx_vocab_diff      ON public.vocabulary(difficulty);
CREATE INDEX IF NOT EXISTS idx_vocab_active    ON public.vocabulary(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_vocab_tags      ON public.vocabulary USING GIN(tags);

ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view vocabulary" ON public.vocabulary FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage vocabulary" ON public.vocabulary
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- KANJI  (2,136+ Joyo kanji target)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kanji (
  id               BIGSERIAL PRIMARY KEY,
  character        TEXT NOT NULL UNIQUE,                 -- e.g. '食'
  jlpt_level       TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  grade            INT,                                  -- school grade 1-8
  stroke_count     INT,
  onyomi           TEXT[],                               -- on-readings
  kunyomi          TEXT[],                               -- kun-readings
  meaning_english  TEXT NOT NULL,
  meaning_hindi    TEXT,
  radical          TEXT,
  radical_meaning  TEXT,
  example_words    JSONB DEFAULT '[]',                   -- [{word, reading, meaning}]
  mnemonic         TEXT,                                 -- memory aid
  kanjivg_id       TEXT,                                 -- KanjiVG reference ID
  audio_url        TEXT,
  frequency_rank   INT,
  tags             TEXT[] DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanji_jlpt      ON public.kanji(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_kanji_grade     ON public.kanji(grade);
CREATE INDEX IF NOT EXISTS idx_kanji_character ON public.kanji(character);
CREATE INDEX IF NOT EXISTS idx_kanji_strokes   ON public.kanji(stroke_count);
CREATE INDEX IF NOT EXISTS idx_kanji_tags      ON public.kanji USING GIN(tags);

ALTER TABLE public.kanji ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view kanji" ON public.kanji FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage kanji" ON public.kanji
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- GRAMMAR  (1,500+ rules target)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grammar (
  id               BIGSERIAL PRIMARY KEY,
  jlpt_level       TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  pattern          TEXT NOT NULL,                        -- e.g. '〜ている'
  title            TEXT NOT NULL,
  meaning_english  TEXT NOT NULL,
  meaning_hindi    TEXT,
  formation        TEXT,                                 -- how to conjugate / attach
  example_japanese TEXT,
  example_english  TEXT,
  example_hindi    TEXT,
  notes            TEXT,
  related_patterns TEXT[] DEFAULT '{}',
  difficulty       INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  lesson_id        TEXT REFERENCES public.lessons(id),
  tags             TEXT[] DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_jlpt    ON public.grammar(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_grammar_pattern ON public.grammar(pattern);
CREATE INDEX IF NOT EXISTS idx_grammar_lesson  ON public.grammar(lesson_id);
CREATE INDEX IF NOT EXISTS idx_grammar_tags    ON public.grammar USING GIN(tags);

ALTER TABLE public.grammar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view grammar" ON public.grammar FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage grammar" ON public.grammar
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- SENTENCES  (100,000+ target)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sentences (
  id               BIGSERIAL PRIMARY KEY,
  jlpt_level       TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  japanese         TEXT NOT NULL,
  hiragana         TEXT,
  romaji           TEXT,
  english          TEXT NOT NULL,
  hindi            TEXT,
  audio_url        TEXT,
  grammar_id       BIGINT REFERENCES public.grammar(id),
  vocabulary_ids   BIGINT[] DEFAULT '{}',               -- vocab words used in sentence
  difficulty       INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  tags             TEXT[] DEFAULT '{}',
  source           TEXT,                                 -- 'tatoeba', 'nhk', 'manual', etc.
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentences_jlpt  ON public.sentences(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_sentences_tags  ON public.sentences USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_sentences_diff  ON public.sentences(difficulty);

ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view sentences" ON public.sentences FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage sentences" ON public.sentences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- DIALOGUES  (conversation practice)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dialogues (
  id          BIGSERIAL PRIMARY KEY,
  jlpt_level  TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  title       TEXT NOT NULL,
  scenario    TEXT,                                      -- 'at the station', 'restaurant', …
  speakers    TEXT[] NOT NULL DEFAULT '{"A","B"}',
  lines       JSONB NOT NULL DEFAULT '[]',               -- [{speaker, japanese, english, hindi, audio_url}]
  lesson_id   TEXT REFERENCES public.lessons(id),
  difficulty  INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  tags        TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dialogues_jlpt ON public.dialogues(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_dialogues_lesson ON public.dialogues(lesson_id);

ALTER TABLE public.dialogues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view dialogues" ON public.dialogues FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage dialogues" ON public.dialogues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- PRACTICE GROUP
-- ================================================================

-- ----------------------------------------------------------------
-- QUIZZES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quizzes (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT REFERENCES public.lessons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  quiz_type   TEXT NOT NULL DEFAULT 'mixed'
                CHECK (quiz_type IN ('vocabulary','kanji','grammar','sentence','mixed')),
  jlpt_level  TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  xp_reward   INT  NOT NULL DEFAULT 20,
  time_limit  INT,                                       -- seconds, NULL = no limit
  pass_score  INT  NOT NULL DEFAULT 70,                  -- % to pass
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON public.quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_jlpt   ON public.quizzes(jlpt_level);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view quizzes" ON public.quizzes FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage quizzes" ON public.quizzes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- QUIZ QUESTIONS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id            BIGSERIAL PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice'
                  CHECK (question_type IN (
                    'multiple_choice','fill_blank','true_false',
                    'matching','ordering','audio','image','writing'
                  )),
  prompt        TEXT NOT NULL,                           -- question text / audio src
  options       JSONB,                                   -- [{label, value, is_correct}]
  correct_answer TEXT NOT NULL,
  explanation    TEXT,
  media_url      TEXT,
  difficulty     INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  sort_order     INT NOT NULL DEFAULT 0,
  vocabulary_id  BIGINT REFERENCES public.vocabulary(id),
  kanji_id       BIGINT REFERENCES public.kanji(id),
  grammar_id     BIGINT REFERENCES public.grammar(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view quiz questions" ON public.quiz_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.is_active = TRUE)
  );
CREATE POLICY "Admins can manage quiz questions" ON public.quiz_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- FLASHCARDS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flashcards (
  id           BIGSERIAL PRIMARY KEY,
  deck_id      TEXT NOT NULL,                            -- group of flashcards
  card_type    TEXT NOT NULL DEFAULT 'vocabulary'
                 CHECK (card_type IN ('vocabulary','kanji','grammar','sentence')),
  front        TEXT NOT NULL,                            -- Japanese text
  back         TEXT NOT NULL,                            -- English / Hindi answer
  hint         TEXT,
  audio_url    TEXT,
  image_url    TEXT,
  vocabulary_id BIGINT REFERENCES public.vocabulary(id),
  kanji_id     BIGINT REFERENCES public.kanji(id),
  grammar_id   BIGINT REFERENCES public.grammar(id),
  jlpt_level   TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  tags         TEXT[] DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck  ON public.flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_jlpt  ON public.flashcards(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_flashcards_tags  ON public.flashcards USING GIN(tags);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view flashcards" ON public.flashcards FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage flashcards" ON public.flashcards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- LEARNING GROUP
-- ================================================================

-- ----------------------------------------------------------------
-- USER PROGRESS (course + module level)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id   TEXT REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id   TEXT REFERENCES public.modules(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started','in_progress','completed')),
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  xp_earned   INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user   ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_course ON public.user_progress(course_id);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own progress" ON public.user_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- QUIZ RESULTS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id      TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score        INT NOT NULL DEFAULT 0,                   -- percentage 0-100
  correct_count INT NOT NULL DEFAULT 0,
  total_count  INT NOT NULL DEFAULT 0,
  xp_earned    INT NOT NULL DEFAULT 0,
  passed       BOOLEAN NOT NULL DEFAULT FALSE,
  time_taken   INT,                                      -- seconds
  answers      JSONB DEFAULT '{}',                       -- {question_id: user_answer}
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz ON public.quiz_results(quiz_id);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz results" ON public.quiz_results
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- REVIEW HISTORY (what was reviewed and when — for SRS analytics)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL DEFAULT 'vocabulary'
                    CHECK (item_type IN ('vocabulary','kanji','grammar','sentence')),
  item_id         BIGINT NOT NULL,                       -- FK to vocab/kanji/grammar/sentence
  quality         INT NOT NULL CHECK (quality BETWEEN 0 AND 5), -- SM-2 quality score
  ease_factor     FLOAT NOT NULL DEFAULT 2.5,
  interval_days   INT NOT NULL DEFAULT 1,
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_history_user ON public.review_history(user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_history_item ON public.review_history(item_type, item_id);

ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own review history" ON public.review_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- MEDIA GROUP
-- ================================================================

-- ----------------------------------------------------------------
-- AUDIO FILES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audio_files (
  id          BIGSERIAL PRIMARY KEY,
  file_path   TEXT NOT NULL UNIQUE,                      -- Supabase Storage path
  public_url  TEXT NOT NULL,
  label       TEXT,                                      -- human label
  language    TEXT NOT NULL DEFAULT 'ja',
  duration_ms INT,
  file_size   INT,
  voice_type  TEXT DEFAULT 'tts'                         -- 'tts', 'native', 'recording'
                CHECK (voice_type IN ('tts','native','recording')),
  vocabulary_id BIGINT REFERENCES public.vocabulary(id),
  kanji_id    BIGINT REFERENCES public.kanji(id),
  sentence_id BIGINT REFERENCES public.sentences(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_vocab   ON public.audio_files(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_audio_kanji   ON public.audio_files(kanji_id);
CREATE INDEX IF NOT EXISTS idx_audio_sentence ON public.audio_files(sentence_id);

ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view audio files" ON public.audio_files FOR SELECT USING (TRUE);
CREATE POLICY "Admins can manage audio files" ON public.audio_files
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- IMAGES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.images (
  id          BIGSERIAL PRIMARY KEY,
  file_path   TEXT NOT NULL UNIQUE,
  public_url  TEXT NOT NULL,
  label       TEXT,
  alt_text    TEXT,
  image_type  TEXT DEFAULT 'illustration'
                CHECK (image_type IN ('illustration','kanji_stroke','mnemonic','badge','avatar')),
  kanji_id    BIGINT REFERENCES public.kanji(id),
  vocabulary_id BIGINT REFERENCES public.vocabulary(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view images" ON public.images FOR SELECT USING (TRUE);
CREATE POLICY "Admins can manage images" ON public.images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- VIDEOS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.videos (
  id          BIGSERIAL PRIMARY KEY,
  file_path   TEXT,                                      -- optional: Supabase Storage
  external_url TEXT,                                     -- YouTube / Vimeo etc.
  title       TEXT NOT NULL,
  description TEXT,
  duration_s  INT,
  lesson_id   TEXT REFERENCES public.lessons(id),
  jlpt_level  TEXT CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT video_source_check CHECK (file_path IS NOT NULL OR external_url IS NOT NULL)
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view videos" ON public.videos FOR SELECT USING (TRUE);
CREATE POLICY "Admins can manage videos" ON public.videos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- ADMIN GROUP
-- ================================================================

-- ----------------------------------------------------------------
-- ANNOUNCEMENTS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  audience    TEXT NOT NULL DEFAULT 'all'
                CHECK (audience IN ('all','free','premium','admin')),
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published announcements" ON public.announcements
  FOR SELECT USING (published_at IS NOT NULL AND published_at <= NOW()
                    AND (expires_at IS NULL OR expires_at > NOW()));
CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- ANALYTICS EVENTS (lightweight platform analytics)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  TEXT NOT NULL,                             -- 'lesson_complete', 'quiz_pass', …
  properties  JSONB DEFAULT '{}',
  session_id  TEXT,
  platform    TEXT DEFAULT 'web' CHECK (platform IN ('web','android','ios')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user    ON public.analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event   ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.analytics_events(created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own events" ON public.analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all analytics" ON public.analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- ----------------------------------------------------------------
-- get_vocab_for_review: returns vocabulary due for SRS review
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vocab_for_review(p_user_id UUID, p_limit INT DEFAULT 20)
RETURNS TABLE (
  word_id TEXT,
  next_review_at TIMESTAMPTZ,
  repetitions INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT word_id, next_review_at, repetitions
  FROM public.review_queue
  WHERE user_id = p_user_id
    AND next_review_at <= NOW()
  ORDER BY next_review_at ASC
  LIMIT p_limit;
$$;

-- ----------------------------------------------------------------
-- increment_user_stat: safely increment a numeric column in user_stats
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_user_stat(
  p_user_id UUID,
  p_stat    TEXT,
  p_amount  INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_stat = 'xp_total' THEN
    UPDATE public.user_stats SET xp_total = xp_total + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_stat = 'xp_today' THEN
    UPDATE public.user_stats SET xp_today = xp_today + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_stat = 'words_learned' THEN
    UPDATE public.user_stats SET words_learned = words_learned + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_stat = 'kanji_learned' THEN
    UPDATE public.user_stats SET kanji_learned = kanji_learned + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_stat = 'lessons_done' THEN
    UPDATE public.user_stats SET lessons_done = lessons_done + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_stat = 'reviews_done' THEN
    UPDATE public.user_stats SET reviews_done = reviews_done + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ================================================================
-- SEED: Insert starter courses and modules
-- ================================================================

INSERT INTO public.courses (id, title, description, jlpt_level, difficulty, sort_order, is_published) VALUES
  ('jlpt-n5', 'JLPT N5 — Beginner',   'Master the basics: Hiragana, Katakana, 800 words, 103 Kanji', 'N5', 1, 1, TRUE),
  ('jlpt-n4', 'JLPT N4 — Elementary', 'Build on N5: 1,500 words, grammar, 181 new Kanji',             'N4', 2, 2, FALSE),
  ('jlpt-n3', 'JLPT N3 — Intermediate','Bridge to fluency: 3,750 words, 367 Kanji',                    'N3', 3, 3, FALSE),
  ('jlpt-n2', 'JLPT N2 — Upper-Intermediate', 'Near-native: 6,000 words, 1,110 Kanji',                'N2', 4, 4, FALSE),
  ('jlpt-n1', 'JLPT N1 — Advanced',   'Full fluency: 10,000+ words, 2,136 Kanji',                      'N1', 5, 5, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.modules (id, course_id, title, description, sort_order, is_published) VALUES
  ('jlpt-n5-hiragana',  'jlpt-n5', 'Hiragana',         '46 basic characters of hiragana',             1, TRUE),
  ('jlpt-n5-katakana',  'jlpt-n5', 'Katakana',         '46 katakana characters for loan words',       2, TRUE),
  ('jlpt-n5-vocab-1',   'jlpt-n5', 'Core Vocabulary 1','First 200 essential N5 vocabulary words',     3, TRUE),
  ('jlpt-n5-kanji-1',   'jlpt-n5', 'Kanji Basics 1',   'First 50 Joyo kanji — Grade 1',               4, TRUE),
  ('jlpt-n5-grammar-1', 'jlpt-n5', 'Grammar Basics 1', 'は、が、を、に、で — core particles',            5, TRUE),
  ('jlpt-n5-vocab-2',   'jlpt-n5', 'Core Vocabulary 2','Next 200 N5 vocabulary words',                 6, FALSE),
  ('jlpt-n5-kanji-2',   'jlpt-n5', 'Kanji Basics 2',   'Next 53 Joyo kanji — completing N5',          7, FALSE),
  ('jlpt-n5-dialogue',  'jlpt-n5', 'Dialogues',        'Real-life N5 conversation practice',          8, FALSE)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ================================================================
-- VERIFY
-- ================================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
