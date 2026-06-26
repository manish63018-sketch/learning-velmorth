'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';

// ================================================================
// Vocabulary Progress Hook — SRS + mastery + bookmarks
// ================================================================

export type VocabStatus = 'new' | 'learning' | 'learned' | 'mastered' | 'difficult';

export interface VocabProgressRecord {
  word_id: string;
  status: VocabStatus;
  is_bookmarked: boolean;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  srs_stage: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  mastered_at: string | null;
}

export interface VocabStats {
  total: number;
  new: number;
  learning: number;
  learned: number;
  mastered: number;
  difficult: number;
  bookmarked: number;
  dueForReview: number;
}

/** SM-2 Algorithm: compute next interval and ease factor */
function sm2(
  quality: number,       // 0–5 (0–2 = wrong, 3–5 = correct)
  repetitions: number,
  easeFactor: number,
  interval: number
): { repetitions: number; easeFactor: number; interval: number; stage: number } {
  if (quality < 3) {
    return {
      repetitions: 0,
      easeFactor: Math.max(1.3, easeFactor - 0.2),
      interval: 1,
      stage: Math.max(0, repetitions - 1),
    };
  }
  const newEase = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  let newInterval: number;
  if (repetitions === 0) newInterval = 1;
  else if (repetitions === 1) newInterval = 6;
  else newInterval = Math.round(interval * newEase);

  return {
    repetitions: repetitions + 1,
    easeFactor: newEase,
    interval: newInterval,
    stage: Math.min(8, repetitions + 1),
  };
}

/** Compute new VocabStatus from SM-2 stage */
function statusFromStage(stage: number, wasCorrect: boolean): VocabStatus {
  if (!wasCorrect && stage === 0) return 'difficult';
  if (stage === 0) return 'learning';
  if (stage <= 2) return 'learning';
  if (stage <= 5) return 'learned';
  return 'mastered';
}

export function useVocabProgress() {
  const { user } = useAuth();
  const supabase = createClient();
  const [isUpdating, setIsUpdating] = useState(false);

  /**
   * Record a vocab review result (SM-2 update)
   */
  const recordReview = useCallback(async (
    wordId: string,
    quality: number  // 0–5
  ): Promise<VocabProgressRecord | null> => {
    if (!user) return null;
    setIsUpdating(true);

    try {
      // Fetch current record
      const { data: existing } = await supabase
        .from('vocab_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('word_id', wordId)
        .maybeSingle();

      const wasCorrect = quality >= 3;
      const cur = existing ?? {
        review_count: 0,
        correct_count: 0,
        incorrect_count: 0,
        srs_stage: 0,
        ease_factor: 2.5,
        interval_days: 1,
        status: 'new' as VocabStatus,
      };

      const { repetitions, easeFactor, interval, stage } = sm2(
        quality,
        cur.srs_stage ?? 0,
        cur.ease_factor ?? 2.5,
        cur.interval_days ?? 1
      );

      const newStatus = statusFromStage(stage, wasCorrect);
      const nextReview = new Date(Date.now() + interval * 86400000).toISOString();
      const isMastered = newStatus === 'mastered';

      const upsertData = {
        user_id: user.id,
        word_id: wordId,
        status: newStatus,
        review_count: (cur.review_count ?? 0) + 1,
        correct_count: (cur.correct_count ?? 0) + (wasCorrect ? 1 : 0),
        incorrect_count: (cur.incorrect_count ?? 0) + (wasCorrect ? 0 : 1),
        srs_stage: stage,
        ease_factor: easeFactor,
        interval_days: interval,
        next_review_at: nextReview,
        last_reviewed_at: new Date().toISOString(),
        mastered_at: isMastered && !existing?.mastered_at ? new Date().toISOString() : existing?.mastered_at ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error } = await supabase
        .from('vocab_progress')
        .upsert(upsertData, { onConflict: 'user_id,word_id' })
        .select()
        .single();

      if (error) throw error;

      // Update user_stats.words_learned if newly learned
      if (wasCorrect && (existing?.status === 'new' || !existing)) {
        await supabase.rpc('increment_daily_usage', { p_user_id: user.id, p_counter: 'lessons_started' });
      }

      return updated as VocabProgressRecord;
    } catch (err) {
      console.error('[VocabProgress] recordReview failed:', err);
      return null;
    } finally {
      setIsUpdating(false);
    }
  }, [user, supabase]);

  /**
   * Mark a word as learned (first exposure)
   */
  const markWordLearned = useCallback(async (wordId: string): Promise<void> => {
    if (!user) return;
    try {
      await supabase
        .from('vocab_progress')
        .upsert({
          user_id: user.id,
          word_id: wordId,
          status: 'learning',
          srs_stage: 1,
          next_review_at: new Date(Date.now() + 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word_id' });

      // Also update legacy user_learned_words for backward compatibility
      await supabase
        .from('user_learned_words')
        .upsert({
          user_id: user.id,
          word_id: wordId,
          quiz_eligible: true,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word_id' });
    } catch (err) {
      console.error('[VocabProgress] markWordLearned failed:', err);
    }
  }, [user, supabase]);

  /**
   * Bulk mark words as learned (e.g., at lesson completion)
   */
  const markWordsBulk = useCallback(async (wordIds: string[]): Promise<void> => {
    if (!user || wordIds.length === 0) return;
    try {
      const rows = wordIds.map(wordId => ({
        user_id: user.id,
        word_id: wordId,
        status: 'learning' as VocabStatus,
        srs_stage: 1,
        next_review_at: new Date(Date.now() + 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .from('vocab_progress')
        .upsert(rows, { onConflict: 'user_id,word_id', ignoreDuplicates: false });

      // Backward compat
      const legacyRows = wordIds.map(wordId => ({
        user_id: user.id,
        word_id: wordId,
        quiz_eligible: true,
        last_seen_at: new Date().toISOString(),
      }));
      await supabase
        .from('user_learned_words')
        .upsert(legacyRows, { onConflict: 'user_id,word_id', ignoreDuplicates: false });
    } catch (err) {
      console.error('[VocabProgress] markWordsBulk failed:', err);
    }
  }, [user, supabase]);

  /**
   * Toggle bookmark on a word
   */
  const toggleBookmark = useCallback(async (wordId: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data: existing } = await supabase
        .from('vocab_progress')
        .select('is_bookmarked')
        .eq('user_id', user.id)
        .eq('word_id', wordId)
        .maybeSingle();

      const newBookmarked = !(existing?.is_bookmarked ?? false);

      await supabase
        .from('vocab_progress')
        .upsert({
          user_id: user.id,
          word_id: wordId,
          is_bookmarked: newBookmarked,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word_id' });

      return newBookmarked;
    } catch (err) {
      console.error('[VocabProgress] toggleBookmark failed:', err);
      return false;
    }
  }, [user, supabase]);

  /**
   * Mark a word as difficult
   */
  const markDifficult = useCallback(async (wordId: string): Promise<void> => {
    if (!user) return;
    try {
      await supabase
        .from('vocab_progress')
        .upsert({
          user_id: user.id,
          word_id: wordId,
          status: 'difficult',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word_id' });
    } catch (err) {
      console.error('[VocabProgress] markDifficult failed:', err);
    }
  }, [user, supabase]);

  /**
   * Fetch words due for review today
   */
  const getDueWords = useCallback(async (limit = 20): Promise<VocabProgressRecord[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('vocab_progress')
        .select('*')
        .eq('user_id', user.id)
        .lte('next_review_at', new Date().toISOString())
        .order('next_review_at', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as VocabProgressRecord[];
    } catch (err) {
      console.error('[VocabProgress] getDueWords failed:', err);
      return [];
    }
  }, [user, supabase]);

  /**
   * Get vocab summary stats
   */
  const getVocabStats = useCallback(async (): Promise<VocabStats> => {
    if (!user) return { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0, dueForReview: 0 };
    try {
      const now = new Date().toISOString();
      const [{ data: allWords }, { count: dueCount }] = await Promise.all([
        supabase.from('vocab_progress').select('status, is_bookmarked').eq('user_id', user.id),
        supabase.from('vocab_progress').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).lte('next_review_at', now),
      ]);

      const stats: VocabStats = { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0, dueForReview: dueCount ?? 0 };
      for (const w of allWords ?? []) {
        stats.total++;
        if (w.status === 'new') stats.new++;
        else if (w.status === 'learning') stats.learning++;
        else if (w.status === 'learned') stats.learned++;
        else if (w.status === 'mastered') stats.mastered++;
        else if (w.status === 'difficult') stats.difficult++;
        if (w.is_bookmarked) stats.bookmarked++;
      }
      return stats;
    } catch {
      return { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0, dueForReview: 0 };
    }
  }, [user, supabase]);

  /**
   * Get bookmarked words
   */
  const getBookmarkedWords = useCallback(async (): Promise<VocabProgressRecord[]> => {
    if (!user) return [];
    try {
      const { data } = await supabase
        .from('vocab_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_bookmarked', true)
        .order('updated_at', { ascending: false });
      return (data ?? []) as VocabProgressRecord[];
    } catch {
      return [];
    }
  }, [user, supabase]);

  /**
   * Get progress record for a specific word
   */
  const getWordProgress = useCallback(async (wordId: string): Promise<VocabProgressRecord | null> => {
    if (!user) return null;
    try {
      const { data } = await supabase
        .from('vocab_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('word_id', wordId)
        .maybeSingle();
      return data as VocabProgressRecord | null;
    } catch {
      return null;
    }
  }, [user, supabase]);

  return {
    recordReview,
    markWordLearned,
    markWordsBulk,
    toggleBookmark,
    markDifficult,
    getDueWords,
    getVocabStats,
    getBookmarkedWords,
    getWordProgress,
    isUpdating,
  };
}
