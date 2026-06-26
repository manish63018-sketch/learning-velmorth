'use client';

import { useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';

// ================================================================
// XP Engine — award XP by event type with server-side atomicity
// ================================================================

export type XPEventType =
  | 'lesson_complete'
  | 'quiz_complete'
  | 'daily_bonus'
  | 'streak_bonus'
  | 'achievement_unlock'
  | 'review_complete'
  | 'vocab_mastered'
  | 'kanji_mastered'
  | 'grammar_complete'
  | 'first_lesson'
  | 'admin_grant';

export const XP_REWARDS: Record<XPEventType, number> = {
  lesson_complete:     15,
  quiz_complete:       10,
  daily_bonus:         20,
  streak_bonus:        0,   // Computed dynamically (5 × streak day, max 50)
  achievement_unlock:  25,
  review_complete:     5,
  vocab_mastered:      3,
  kanji_mastered:      5,
  grammar_complete:    10,
  first_lesson:        50,
  admin_grant:         0,   // Set by admin
};

/** Calculate level from total XP using progressive curve */
export function calculateLevel(xp: number): {
  level: number;
  xpInLevel: number;
  xpForNext: number;
  progress: number; // 0–1
} {
  let level = 1;
  let threshold = 100;
  let accumulated = 0;

  while (xp >= accumulated + threshold && level < 100) {
    accumulated += threshold;
    threshold += 100;
    level++;
  }

  const xpInLevel = xp - accumulated;
  return {
    level,
    xpInLevel,
    xpForNext: threshold,
    progress: Math.min(xpInLevel / threshold, 1),
  };
}

export function useXP() {
  const { user, profile, updateProfileStats } = useAuth();
  const supabase = createClient();

  /**
   * Award XP via the server-side RPC.
   * Falls back to local updateProfileStats on error.
   */
  const awardXP = useCallback(async (params: {
    amount: number;
    eventType: XPEventType;
    lessonId?: string;
    wordId?: string;
    badgeId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ newXp: number; newLevel: number } | null> => {
    if (!user) return null;

    const { amount, eventType, lessonId, wordId, badgeId, metadata } = params;

    try {
      const { data, error } = await supabase.rpc('rpc_award_xp', {
        p_user_id:    user.id,
        p_amount:     amount,
        p_event_type: eventType,
        p_lesson_id:  lessonId ?? null,
        p_word_id:    wordId ?? null,
        p_badge_id:   badgeId ?? null,
        p_metadata:   metadata ?? {},
      });

      if (error) throw error;

      const newXp = data as number;
      const { level: newLevel } = calculateLevel(newXp);

      // Sync local profile state
      await updateProfileStats(amount, 0);

      return { newXp, newLevel };
    } catch (err) {
      console.error('[XP] RPC failed, falling back to local update:', err);
      // Fallback: update local state only
      await updateProfileStats(amount, 0);
      const newXp = (profile?.xp ?? 0) + amount;
      const { level: newLevel } = calculateLevel(newXp);
      return { newXp, newLevel };
    }
  }, [user, profile, supabase, updateProfileStats]);

  /**
   * Get today's XP earned (from DB)
   */
  const getTodayXP = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    try {
      const { data } = await supabase
        .from('daily_activity')
        .select('xp_earned')
        .eq('user_id', user.id)
        .eq('activity_date', new Date().toISOString().split('T')[0])
        .maybeSingle();
      return data?.xp_earned ?? 0;
    } catch {
      return profile?.xp_today ?? 0;
    }
  }, [user, supabase, profile]);

  /**
   * Get XP history for the last N days
   */
  const getXPHistory = useCallback(async (days = 30): Promise<Array<{ date: string; xp: number }>> => {
    if (!user) return [];
    try {
      const { data } = await supabase
        .from('daily_activity')
        .select('activity_date, xp_earned')
        .eq('user_id', user.id)
        .gte('activity_date', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
        .order('activity_date', { ascending: true });
      return (data ?? []).map(d => ({ date: d.activity_date, xp: d.xp_earned }));
    } catch {
      return [];
    }
  }, [user, supabase]);

  const levelInfo = calculateLevel(profile?.xp ?? 0);

  return {
    awardXP,
    getTodayXP,
    getXPHistory,
    levelInfo,
    XP_REWARDS,
    calculateLevel,
  };
}
