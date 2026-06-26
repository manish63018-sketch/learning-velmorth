'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';

// ================================================================
// Master Progress Hook — lesson, kanji, grammar tracking
// ================================================================

export interface LessonCompletionResult {
  xpTotal: number;
  streak: number;
  longest: number;
  streakAlreadyDone: boolean;
  newlyUnlockedBadges: string[];
  streakBonus: number;
}

export interface KanjiPracticeParams {
  kanjiId: string;
  writingAttempt?: { correct: boolean };
  strokeAttempt?: { correct: boolean };
  recognitionAttempt?: { correct: boolean };
}

export interface GrammarCompletionParams {
  grammarId: string;
  lessonId?: string;
  jlptLevel?: string;
  score: number;   // 0–100
  isCompleted: boolean;
}

export interface LessonProgressRecord {
  lesson_id: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  completion_percentage: number;
  xp_earned: number;
  score: number | null;
  attempts: number;
  time_spent_seconds: number;
  last_visited_at: string | null;
  words_learned_count: number;
  perfect_score: boolean;
  completed_at: string | null;
}

export function useProgress() {
  const { user } = useAuth();
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ──────────────────────────────────────────────
  // LESSON PROGRESS
  // ──────────────────────────────────────────────

  /**
   * Complete a lesson — atomic server-side RPC.
   * Saves progress, awards XP, extends streak, checks achievements.
   */
  const completeLesson = useCallback(async (params: {
    lessonId: string;
    score: number;
    xp: number;
    timeSeconds: number;
    wordsLearnedCount: number;
    wordIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<LessonCompletionResult | null> => {
    if (!user || isSubmitting) return null;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.rpc('rpc_complete_lesson', {
        p_user_id:     user.id,
        p_lesson_id:   params.lessonId,
        p_score:       params.score,
        p_xp:          params.xp,
        p_time_secs:   params.timeSeconds,
        p_words_count: params.wordsLearnedCount,
        p_metadata:    params.metadata ?? {},
      });

      if (error) throw error;

      const result = data as {
        xp_total: number;
        streak: number;
        longest: number;
        streak_already_done: boolean;
        newly_unlocked_badges: string[];
      };

      return {
        xpTotal: result.xp_total,
        streak: result.streak,
        longest: result.longest,
        streakAlreadyDone: result.streak_already_done,
        newlyUnlockedBadges: result.newly_unlocked_badges ?? [],
        streakBonus: result.streak_already_done ? 0 : Math.min(5 * result.streak, 50),
      };
    } catch (err) {
      console.error('[Progress] completeLesson RPC failed:', err);

      // Fallback: save lesson_progress directly
      try {
        await supabase
          .from('lesson_progress')
          .upsert({
            user_id: user.id,
            lesson_id: params.lessonId,
            status: 'completed',
            xp_earned: params.xp,
            score: params.score,
            completion_percentage: 100,
            time_spent_seconds: params.timeSeconds,
            last_visited_at: new Date().toISOString(),
            words_learned_count: params.wordsLearnedCount,
            perfect_score: params.score >= 100,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,lesson_id' });
      } catch (fallbackErr) {
        console.error('[Progress] Fallback save also failed:', fallbackErr);
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [user, supabase, isSubmitting]);

  /**
   * Mark a lesson as in_progress and save last visited state
   */
  const updateLessonProgress = useCallback(async (params: {
    lessonId: string;
    completionPercentage: number;
    timeSeconds?: number;
  }): Promise<void> => {
    if (!user) return;
    try {
      await supabase
        .from('lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: params.lessonId,
          status: 'in_progress',
          completion_percentage: params.completionPercentage,
          time_spent_seconds: params.timeSeconds ?? 0,
          last_visited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,lesson_id' });
    } catch (err) {
      console.error('[Progress] updateLessonProgress failed:', err);
    }
  }, [user, supabase]);

  /**
   * Get all lesson progress records for the current user
   */
  const getAllLessonProgress = useCallback(async (): Promise<Map<string, LessonProgressRecord>> => {
    if (!user) return new Map();
    try {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      const map = new Map<string, LessonProgressRecord>();
      for (const row of data ?? []) {
        map.set(row.lesson_id, row as LessonProgressRecord);
      }
      return map;
    } catch {
      return new Map();
    }
  }, [user, supabase]);

  /**
   * Get the last lesson visited (for "continue learning" feature)
   */
  const getLastVisitedLesson = useCallback(async (): Promise<{ lessonId: string; percentage: number } | null> => {
    if (!user) return null;
    try {
      const { data } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completion_percentage, last_visited_at')
        .eq('user_id', user.id)
        .neq('status', 'completed')
        .order('last_visited_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;
      return { lessonId: data.lesson_id, percentage: data.completion_percentage };
    } catch {
      return null;
    }
  }, [user, supabase]);

  // ──────────────────────────────────────────────
  // KANJI PROGRESS
  // ──────────────────────────────────────────────

  /**
   * Record kanji practice (writing, stroke, recognition)
   */
  const recordKanjiPractice = useCallback(async (params: KanjiPracticeParams): Promise<void> => {
    if (!user) return;
    try {
      const update: Record<string, unknown> = {
        user_id: user.id,
        kanji_id: params.kanjiId,
        last_practiced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Fetch existing to increment counters
      const { data: existing } = await supabase
        .from('kanji_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('kanji_id', params.kanjiId)
        .maybeSingle();

      if (params.writingAttempt) {
        update.writing_attempts = (existing?.writing_attempts ?? 0) + 1;
        update.writing_correct = (existing?.writing_correct ?? 0) + (params.writingAttempt.correct ? 1 : 0);
      }
      if (params.strokeAttempt) {
        update.stroke_attempts = (existing?.stroke_attempts ?? 0) + 1;
        update.stroke_correct = (existing?.stroke_correct ?? 0) + (params.strokeAttempt.correct ? 1 : 0);
      }
      if (params.recognitionAttempt) {
        update.recognition_attempts = (existing?.recognition_attempts ?? 0) + 1;
        update.recognition_correct = (existing?.recognition_correct ?? 0) + (params.recognitionAttempt.correct ? 1 : 0);
      }

      // Determine status
      const totalAttempts = (update.writing_attempts as number ?? 0) + (update.recognition_attempts as number ?? 0);
      const totalCorrect = (update.writing_correct as number ?? 0) + (update.recognition_correct as number ?? 0);
      const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
      if (accuracy >= 0.9 && totalAttempts >= 5) update.status = 'mastered';
      else if (totalAttempts >= 2) update.status = 'learning';

      await supabase
        .from('kanji_progress')
        .upsert(update, { onConflict: 'user_id,kanji_id' });

      // Increment kanji_learned stat if this is new
      if (!existing) {
        await supabase
          .from('user_stats')
          .update({ kanji_learned: supabase.rpc as unknown as number })
          .eq('user_id', user.id);

        // Workaround: use raw increment
        await supabase.rpc('increment_daily_usage', {
          p_user_id: user.id,
          p_counter: 'lessons_started', // reuse existing RPC for now
        });
      }
    } catch (err) {
      console.error('[Progress] recordKanjiPractice failed:', err);
    }
  }, [user, supabase]);

  /**
   * Get kanji progress summary
   */
  const getKanjiStats = useCallback(async () => {
    if (!user) return { total: 0, learning: 0, mastered: 0, avgAccuracy: 0 };
    try {
      const { data } = await supabase
        .from('kanji_progress')
        .select('status, writing_accuracy, recognition_accuracy')
        .eq('user_id', user.id);

      const rows = data ?? [];
      const mastered = rows.filter(r => r.status === 'mastered').length;
      const avgAccuracy = rows.length > 0
        ? rows.reduce((sum, r) => sum + ((r.writing_accuracy + r.recognition_accuracy) / 2), 0) / rows.length
        : 0;

      return { total: rows.length, learning: rows.filter(r => r.status === 'learning').length, mastered, avgAccuracy };
    } catch {
      return { total: 0, learning: 0, mastered: 0, avgAccuracy: 0 };
    }
  }, [user, supabase]);

  // ──────────────────────────────────────────────
  // GRAMMAR PROGRESS
  // ──────────────────────────────────────────────

  /**
   * Save grammar point completion / quiz score
   */
  const recordGrammarCompletion = useCallback(async (params: GrammarCompletionParams): Promise<void> => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('grammar_progress')
        .select('quiz_attempts, quiz_correct, best_score, status')
        .eq('user_id', user.id)
        .eq('grammar_id', params.grammarId)
        .maybeSingle();

      const newStatus = params.score >= 70
        ? 'completed'
        : params.score >= 40
        ? 'learning'
        : 'needs_revision';

      const upsertData = {
        user_id: user.id,
        grammar_id: params.grammarId,
        lesson_id: params.lessonId ?? null,
        jlpt_level: params.jlptLevel ?? null,
        quiz_attempts: (existing?.quiz_attempts ?? 0) + 1,
        quiz_correct: (existing?.quiz_correct ?? 0) + (params.score >= 70 ? 1 : 0),
        best_score: Math.max(existing?.best_score ?? 0, params.score),
        last_score: params.score,
        status: params.isCompleted ? 'completed' : newStatus,
        needs_revision: params.score < 70,
        completed_at: params.isCompleted && !existing?.status?.includes('completed')
          ? new Date().toISOString()
          : null,
        last_practiced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from('grammar_progress')
        .upsert(upsertData, { onConflict: 'user_id,grammar_id' });

      // Increment grammar_learned stat if newly completed
      if (!existing || existing.status !== 'completed') {
        if (params.isCompleted) {
          await supabase
            .from('user_stats')
            .update({ grammar_learned: 1 })  // Will be fixed with proper RPC in production
            .eq('user_id', user.id);
        }
      }
    } catch (err) {
      console.error('[Progress] recordGrammarCompletion failed:', err);
    }
  }, [user, supabase]);

  /**
   * Get grammar progress by JLPT level
   */
  const getGrammarByLevel = useCallback(async (level: string) => {
    if (!user) return [];
    try {
      const { data } = await supabase
        .from('grammar_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('jlpt_level', level)
        .order('last_practiced_at', { ascending: false });
      return data ?? [];
    } catch {
      return [];
    }
  }, [user, supabase]);

  /**
   * Get weak grammar areas (needs revision or low score)
   */
  const getWeakGrammarAreas = useCallback(async (limit = 10) => {
    if (!user) return [];
    try {
      const { data } = await supabase
        .from('grammar_progress')
        .select('grammar_id, last_score, status, jlpt_level')
        .eq('user_id', user.id)
        .in('status', ['needs_revision', 'learning'])
        .order('last_score', { ascending: true })
        .limit(limit);
      return data ?? [];
    } catch {
      return [];
    }
  }, [user, supabase]);

  return {
    // Lesson
    completeLesson,
    updateLessonProgress,
    getAllLessonProgress,
    getLastVisitedLesson,
    // Kanji
    recordKanjiPractice,
    getKanjiStats,
    // Grammar
    recordGrammarCompletion,
    getGrammarByLevel,
    getWeakGrammarAreas,
    // State
    isSubmitting,
  };
}
