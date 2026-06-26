'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';
import { calculateLevel } from './useXP';

// ================================================================
// Dashboard Analytics Hook — aggregate real-time user dashboard
// ================================================================

export interface VocabStats {
  total: number;
  new: number;
  learning: number;
  learned: number;
  mastered: number;
  difficult: number;
  bookmarked: number;
}

export interface JLPTReadiness {
  N5: number;
  N4: number;
  N3: number;
  N2: number;
  N1: number;
}

export interface WeakArea {
  grammar_id: string;
  last_score: number;
  status: string;
}

export interface HeatmapEntry {
  date: string;
  xp: number;
  lessons: number;
}

export interface DashboardData {
  // Core stats
  xpTotal: number;
  xpToday: number;
  level: number;
  xpInLevel: number;
  xpForNext: number;
  levelProgress: number;
  gems: number;
  // Streaks
  streak: number;
  longestStreak: number;
  // Learning stats
  lessonsDone: number;
  wordsLearned: number;
  kanjiLearned: number;
  grammarLearned: number;
  reviewsDone: number;
  badgesEarned: number;
  // Progress
  completionPercentage: number;
  // JLPT
  jlptReadiness: Partial<JLPTReadiness>;
  // Weak areas
  weakAreas: WeakArea[];
  // Heatmap
  heatmap: HeatmapEntry[];
  // Vocab detail
  vocabStats: VocabStats;
  // Meta
  lastUpdated: string;
}

const DEFAULT_DASHBOARD: DashboardData = {
  xpTotal: 0, xpToday: 0, level: 1, xpInLevel: 0, xpForNext: 100, levelProgress: 0, gems: 0,
  streak: 0, longestStreak: 0,
  lessonsDone: 0, wordsLearned: 0, kanjiLearned: 0, grammarLearned: 0, reviewsDone: 0, badgesEarned: 0,
  completionPercentage: 0,
  jlptReadiness: { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 },
  weakAreas: [],
  heatmap: [],
  vocabStats: { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0 },
  lastUpdated: new Date().toISOString(),
};

export function useDashboard() {
  const { user, profile } = useAuth();
  const supabase = createClient();
  const [data, setData] = useState<DashboardData>(DEFAULT_DASHBOARD);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (): Promise<void> => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      // Try server-side RPC first for efficiency
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_dashboard', {
        p_user_id: user.id,
      });

      if (!rpcErr && rpcData) {
        const d = rpcData as Record<string, unknown>;
        const { level, xpInLevel, xpForNext, progress } = calculateLevel(d.xp_total as number ?? 0);

        setData({
          xpTotal: d.xp_total as number ?? 0,
          xpToday: d.xp_today as number ?? 0,
          level,
          xpInLevel,
          xpForNext,
          levelProgress: progress,
          gems: d.gems as number ?? 0,
          streak: d.streak as number ?? 0,
          longestStreak: d.longest_streak as number ?? 0,
          lessonsDone: d.lessons_done as number ?? 0,
          wordsLearned: d.words_learned as number ?? 0,
          kanjiLearned: d.kanji_learned as number ?? 0,
          grammarLearned: d.grammar_learned as number ?? 0,
          reviewsDone: d.reviews_done as number ?? 0,
          badgesEarned: d.badges_earned as number ?? 0,
          completionPercentage: computeCompletion(d.lessons_done as number, d.words_learned as number),
          jlptReadiness: (d.jlpt_readiness as Partial<JLPTReadiness>) ?? {},
          weakAreas: (d.weak_areas as WeakArea[]) ?? [],
          heatmap: ((d.heatmap as HeatmapEntry[]) ?? []).map(h => ({
            date: h.date,
            xp: h.xp ?? 0,
            lessons: h.lessons ?? 0,
          })),
          vocabStats: parseVocabStats(d.vocab_stats as Record<string, number>),
          lastUpdated: new Date().toISOString(),
        });
        return;
      }

      // Fallback: parallel queries
      await fetchDashboardFallback();
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
      setError('Failed to load dashboard data');
      // Use profile data as minimal fallback
      if (profile) {
        const { level, xpInLevel, xpForNext, progress } = calculateLevel(profile.xp);
        setData(prev => ({
          ...prev,
          xpTotal: profile.xp,
          xpToday: profile.xp_today ?? 0,
          level,
          xpInLevel,
          xpForNext,
          levelProgress: progress,
          streak: profile.streak,
          lessonsDone: profile.lessons_done,
          wordsLearned: profile.words_learned,
          kanjiLearned: profile.kanji_learned,
          reviewsDone: profile.reviews_done,
          lastUpdated: new Date().toISOString(),
        }));
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase, profile]);

  const fetchDashboardFallback = useCallback(async () => {
    if (!user) return;
    const [
      { data: stats },
      { data: streaks },
      { count: badges },
      { data: jlpt },
      { data: heatmap },
      { data: vocabData },
    ] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_streaks').select('streak, longest').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_badges').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('jlpt_progress').select('level, correct').eq('user_id', user.id),
      supabase.from('daily_activity').select('activity_date, xp_earned, lessons_completed')
        .eq('user_id', user.id).gte('activity_date', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
        .order('activity_date'),
      supabase.from('vocab_progress').select('status, is_bookmarked').eq('user_id', user.id),
    ]);

    const xp = stats?.xp_total ?? 0;
    const { level, xpInLevel, xpForNext, progress } = calculateLevel(xp);

    // Compute JLPT readiness
    const jlptReadiness: Partial<JLPTReadiness> = {};
    if (jlpt) {
      const byLevel: Record<string, { correct: number; total: number }> = {};
      for (const row of jlpt) {
        if (!byLevel[row.level]) byLevel[row.level] = { correct: 0, total: 0 };
        byLevel[row.level].total++;
        if (row.correct) byLevel[row.level].correct++;
      }
      for (const [level, { correct, total }] of Object.entries(byLevel)) {
        (jlptReadiness as Record<string, number>)[level] = total > 0 ? Math.round(100 * correct / total) : 0;
      }
    }

    // Vocab stats
    const vocabStats: VocabStats = { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0 };
    for (const v of vocabData ?? []) {
      vocabStats.total++;
      const status = v.status as keyof VocabStats;
      if (status in vocabStats && status !== 'total' && status !== 'bookmarked') {
        vocabStats[status]++;
      }
      if (v.is_bookmarked) vocabStats.bookmarked++;
    }

    setData({
      xpTotal: xp,
      xpToday: stats?.xp_today ?? 0,
      level,
      xpInLevel,
      xpForNext,
      levelProgress: progress,
      gems: stats?.gems_balance ?? 0,
      streak: streaks?.streak ?? 0,
      longestStreak: streaks?.longest ?? 0,
      lessonsDone: stats?.lessons_done ?? 0,
      wordsLearned: stats?.words_learned ?? 0,
      kanjiLearned: stats?.kanji_learned ?? 0,
      grammarLearned: stats?.grammar_learned ?? 0,
      reviewsDone: stats?.reviews_done ?? 0,
      badgesEarned: badges ?? 0,
      completionPercentage: computeCompletion(stats?.lessons_done ?? 0, stats?.words_learned ?? 0),
      jlptReadiness,
      weakAreas: [],
      heatmap: (heatmap ?? []).map(h => ({ date: h.activity_date, xp: h.xp_earned, lessons: h.lessons_completed })),
      vocabStats,
      lastUpdated: new Date().toISOString(),
    });
  }, [user, supabase]);

  // Auto-fetch on mount and user change
  useEffect(() => {
    if (user) fetchDashboard();
  }, [user?.id]);

  return { data, isLoading, error, refresh: fetchDashboard };
}

function computeCompletion(lessonsDone: number, wordsLearned: number): number {
  // Rough: assume 200 total lessons + 1000 total words for N1 completion
  const lessonPct = Math.min(100, (lessonsDone / 200) * 100);
  const wordPct = Math.min(100, (wordsLearned / 1000) * 100);
  return Math.round((lessonPct + wordPct) / 2);
}

function parseVocabStats(raw: Record<string, number> | undefined): VocabStats {
  if (!raw) return { total: 0, new: 0, learning: 0, learned: 0, mastered: 0, difficult: 0, bookmarked: 0 };
  return {
    total: raw.total ?? 0,
    new: raw.new ?? 0,
    learning: raw.learning ?? 0,
    learned: raw.learned ?? 0,
    mastered: raw.mastered ?? 0,
    difficult: raw.difficult ?? 0,
    bookmarked: raw.bookmarked ?? 0,
  };
}
