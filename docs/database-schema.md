# Learn with Velmorth v2 — Database Schema Specification

This document provides a comprehensive specification of the Supabase PostgreSQL database schema. All tables run with **Row Level Security (RLS)** active, forcing strict access control from Day 1.

---

## Database Architecture Overview

The database is divided into logical schema groups:
1. **Identity & Settings**: Core user profiles, role mappings, and configuration states.
2. **Learning Content**: Database-backed catalog of courses, modules, lessons, vocabulary, grammar, and media registry.
3. **Progress & Spaced Repetition**: Student study history, SM-2 review scheduler, and writing sessions.
4. **Gamification**: Badge rules and user unlocking records.
5. **System & Billing**: Usage logs, audit streams, AI conversation history, and payment transactions.

---

## 1. Identity & Settings Group

### `profiles`
User profiles mapping to `auth.users`. Contains display information.
* **Fields:**
  * `id` `UUID` (PK, foreign key to `auth.users` on delete cascade)
  * `username` `TEXT` (Unique, indexed)
  * `display_name` `TEXT` (Default `''`)
  * `avatar_url` `TEXT` (Nullable)
  * `bio` `TEXT` (Default `''`)
  * `created_at` / `updated_at` `TIMESTAMPTZ`
* **RLS Policies:**
  * SELECT: Anyone can view profiles (to enable leaderboards & community).
  * INSERT / UPDATE: Active user can manage their own profile (`auth.uid() = id`).

### `user_settings`
User-level configuration and preferences.
* **Fields:**
  * `user_id` `UUID` (PK, references `auth.users`)
  * `theme` `TEXT` (Default `'dark'` — `dark` | `light` | `system`)
  * `ui_language` `TEXT` (Default `'en'`)
  * `tts_enabled` `BOOLEAN` (Default `true`)
  * `goal_minutes` `INT` (Default `10`)
  * `notifications` `BOOLEAN` (Default `true`)
  * `jlpt_target` `TEXT` (Default `'N5'`)
  * `heart_system_enabled` `BOOLEAN` (Default `true`)
  * `heart_recovery_mode` `TEXT` (Default `'time'`)
  * `heart_recovery_hours` `INT` (Default `24`)
* **RLS Policies:**
  * ALL: Restricted to profile owner (`auth.uid() = user_id`).

### `user_stats`
Aggregated counters tracking overall study achievements and daily heart recovery status.
* **Fields:**
  * `user_id` `UUID` (PK, references `auth.users`)
  * `xp_total` `INT` (Default `0`)
  * `xp_today` `INT` (Default `0`)
  * `gems_balance` `INT` (Default `0` — mapped to "leaves")
  * `lessons_done` `INT` (Default `0`)
  * `words_learned` `INT` (Default `0`)
  * `reviews_done` `INT` (Default `0`)
  * `kanji_learned` `INT` (Default `0`)
  * `speak_sessions` `INT` (Default `0`)
  * `hearts_total` / `hearts_max` `INT` (Default `25`)
  * `hearts_used_today` `INT` (Default `0`)
  * `hearts_recover_at` / `hearts_last_debit_at` `TIMESTAMPTZ`
  * `last_active` `DATE` (Indexed)
* **RLS Policies:**
  * ALL: Restricted to profile owner (`auth.uid() = user_id`).

### `user_streaks`
Active streaks and long-term streak achievements.
* **Fields:**
  * `user_id` `UUID` (PK, references `auth.users`)
  * `streak` / `longest` `INT` (Default `0`)
  * `freeze_count` `INT` (Default `0` — active freezes in inventory)
  * `last_study_at` `DATE`
* **RLS Policies:**
  * ALL: Mapped to owner (`auth.uid() = user_id`).

### `entitlements`
Subscription and feature tier limits mapping.
* **Fields:**
  * `user_id` `UUID` (PK, references `auth.users`)
  * `plan_id` `TEXT` (Default `'free'` — `free` | `starter` | `plus` | `pro`)
  * `status` `TEXT` (Default `'free'` — `free` | `starter` | `plus` | `pro` | `yearly` | `cancelled`)
  * `hearts_limit` `INT` (Default `25`)
  * `ai_limit_daily` `INT` (Default `5`)
  * `lessons_limit_daily` `INT` (Default `5`)
  * `ads_enabled` `BOOLEAN` (Default `true`)
  * `starts_at` / `ends_at` `TIMESTAMPTZ`
  * `razorpay_order_id` / `razorpay_payment_id` `TEXT`
* **RLS Policies:**
  * SELECT: Accessible by owner (`auth.uid() = user_id`).
  * INSERT / UPDATE: Handled via RPC/Edge triggers.

### `admin_roles`
Tracks administrative privilege level.
* **Fields:**
  * `user_id` `UUID` (PK, references `auth.users`)
  * `role` `TEXT` (Default `'admin'` — `admin` | `super_admin` | `moderator`)
  * `granted_by` `UUID`
  * `granted_at` `TIMESTAMPTZ`
* **RLS Policies:**
  * SELECT: Verified admins only.

---

## 2. Learning Content Group

### `courses`
* **Fields:**
  * `id` `TEXT` (PK)
  * `title` / `description` `TEXT`
  * `language` `TEXT` (Default `'ja'`)
  * `jlpt_level` `TEXT` (N5-N1)
  * `difficulty` `INT` (1 to 5)
  * `thumbnail_url` `TEXT`
  * `is_published` `BOOLEAN`
  * `sort_order` `INT`
* **RLS Policies:**
  * SELECT: Available to everyone if `is_published = true`.
  * ALL: Managed exclusively by `admin_roles`.

### `modules`
* **Fields:**
  * `id` `TEXT` (PK)
  * `course_id` `TEXT` (References `courses(id)`)
  * `title` / `description` `TEXT`
  * `sort_order` `INT`
  * `is_published` `BOOLEAN`

### `lessons`
* **Fields:**
  * `id` `TEXT` (PK)
  * `module_id` `TEXT` (References `modules(id)`)
  * `title` / `description` `TEXT`
  * `lesson_type` `TEXT` (`vocabulary` | `grammar` | `kanji` | `speaking` | `writing` | `quiz` | `dialogue`)
  * `xp_reward` `INT` (Default `10`)
  * `sort_order` `INT`
  * `is_published` `BOOLEAN`
  * `content` `JSONB` (Inline schema data definitions)

### `vocabulary`
* **Fields:**
  * `id` `TEXT` (PK)
  * `word` / `romaji` / `kana` `TEXT`
  * `meaning_en` / `meaning_hi` `TEXT`
  * `jlpt_level` `TEXT`
  * `is_common` `BOOLEAN`
  * `audio_url` `TEXT`

### `kanji`
* **Fields:**
  * `id` `TEXT` (PK)
  * `character` `TEXT` (Unique)
  * `stroke_count` `INT`
  * `meanings` `TEXT[]`
  * `readings_on` / `readings_kun` `TEXT[]`
  * `stroke_order_data` `JSONB` (SVG stroke points coordinates)

### `grammar`
* **Fields:**
  * `id` `TEXT` (PK)
  * `title` / `structure` / `explanation_en` / `explanation_hi` `TEXT`
  * `jlpt_level` `TEXT`

### `sentences`
* **Fields:**
  * `id` `TEXT` (PK)
  * `japanese` / `english` / `romaji` / `hindi` `TEXT`
  * `linked_vocab` / `linked_grammar` / `linked_kanji` `TEXT[]`

### `dialogues`
* **Fields:**
  * `id` `TEXT` (PK)
  * `title` / `scene` `TEXT`
  * `speakers` `TEXT[]`
  * `lines` `JSONB` (Array of speech fragments, Romaji, English, Hindi, audio URLs)

### `quizzes`
* **Fields:**
  * `id` `TEXT` (PK)
  * `lesson_id` `TEXT` (References `lessons(id)`)
  * `title` `TEXT`
  * `passing_score` `INT` (Default `80`)

### `quiz_questions`
* **Fields:**
  * `id` `TEXT` (PK)
  * `quiz_id` `TEXT` (References `quizzes(id)`)
  * `question_type` `TEXT` (`multiple_choice` | `match_pairs` | `fill_blank` | `shadow_evaluation`)
  * `prompt` `TEXT`
  * `options` `JSONB` (Multiple choice string options)
  * `correct_answer` `TEXT`
  * `explanation` `TEXT`

---

## 3. Progress & Spaced Repetition Group

### `lesson_progress`
User completion state per lesson.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `lesson_id` `TEXT` (References `lessons(id)`)
  * `status` `TEXT` (`locked` | `available` | `in_progress` | `completed`)
  * `xp_earned` `INT`
  * `score` `INT`
  * `attempts` `INT`
  * `completed_at` `TIMESTAMPTZ`
* **Constraint:** Unique composite index on `(user_id, lesson_id)`.

### `review_queue`
Active SM-2 scheduler tracking when words are next due for review.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `word_id` `TEXT`
  * `ease_factor` `FLOAT` (Default `2.5`)
  * `interval_days` `INT` (Default `1`)
  * `repetitions` `INT` (Default `0`)
  * `next_review_at` `TIMESTAMPTZ` (Default `now()`)
  * `last_reviewed_at` `TIMESTAMPTZ`
* **Constraint:** Unique composite key `(user_id, word_id)`.

### `writing_history`
Detailed historical coordinates tracking accuracy of handwriting canvas practice.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `char_id` `TEXT`
  * `char_type` `TEXT` (`hiragana` | `katakana` | `kanji`)
  * `level` `TEXT`
  * `accuracy_score` / `stroke_order_score` / `shape_score` / `proportion_score` `INT`
  * `suggestions` `TEXT[]`

### `writing_mastery`
Unified writing strength index from 0 to 5.
* **Fields:**
  * `user_id` `UUID` (References `auth.users`)
  * `char_id` `TEXT` (PK composite)
  * `char_type` `TEXT`
  * `level` `TEXT`
  * `mastery_level` `INT` (Default `0` to `5` max)
  * `attempts` / `last_score` `INT`

---

## 4. Gamification Group

### `badges`
The master catalog of achievements.
* **Fields:**
  * `id` `TEXT` (PK)
  * `name` / `description` / `icon` `TEXT`
  * `rarity` `TEXT` (`common` | `rare` | `epic` | `legendary`)
  * `condition` `JSONB`

### `user_badges`
Earned badges unlocked by users.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `badge_id` `TEXT` (References `badges(id)`)
  * `earned_at` `TIMESTAMPTZ`

---

## 5. System, Analytics & Billing

### `payment_history`
Records Razorpay order transactions.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `razorpay_order_id` / `razorpay_payment_id` / `razorpay_signature` `TEXT`
  * `plan_id` `TEXT`
  * `amount` `INT` (Charged in paisa)
  * `currency` `TEXT` (Default `'INR'`)
  * `status` `TEXT` (`created` | `captured` | `failed` | `refunded`)
  * `error_reason` `TEXT`
  * `created_at` `TIMESTAMPTZ`

### `usage_counters`
Enforces daily limits check on free plan.
* **Fields:**
  * `user_id` `UUID` (References `auth.users`)
  * `date` `DATE` (Default `CURRENT_DATE`)
  * `ai_requests` `INT` (Default `0`)
  * `lessons_started` `INT` (Default `0`)
  * `hearts_used` `INT` (Default `0`)
* **Constraint:** Primary composite key `(user_id, date)`.

### `ai_chat_messages`
Chat message history for AI conversation threads.
* **Fields:**
  * `id` `UUID` (PK)
  * `user_id` `UUID` (References `auth.users`)
  * `role` `TEXT` (`user` | `assistant`)
  * `content` `TEXT`
  * `session_id` `TEXT`
  * `created_at` `TIMESTAMPTZ`
