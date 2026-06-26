'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';

// ================================================================
// Achievement Engine — evaluate conditions and award badges
// ================================================================

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned_at?: string;
}

export interface AchievementCheckResult {
  newlyUnlocked: Badge[];
  total: number;
}

export function useAchievements() {
  const { user } = useAuth();
  const supabase = createClient();
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Server-side achievement check — uses the rpc_check_achievements RPC.
   * Returns newly unlocked badge metadata.
   */
  const checkAchievements = useCallback(async (): Promise<AchievementCheckResult> => {
    if (!user || isChecking) return { newlyUnlocked: [], total: 0 };
    setIsChecking(true);

    try {
      const { data: newBadgeIds, error } = await supabase.rpc('rpc_check_achievements', {
        p_user_id: user.id,
      });

      if (error) throw error;

      const newIds = (newBadgeIds as string[]) ?? [];
      if (newIds.length === 0) {
        const { count } = await supabase
          .from('user_badges')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        return { newlyUnlocked: [], total: count ?? 0 };
      }

      // Fetch badge metadata for the newly unlocked badges
      const { data: badgeData } = await supabase
        .from('badges')
        .select('id, name, description, icon, rarity')
        .in('id', newIds);

      const newlyUnlocked: Badge[] = (badgeData ?? []).map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        rarity: b.rarity as Badge['rarity'],
        earned_at: new Date().toISOString(),
      }));

      const { count } = await supabase
        .from('user_badges')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      return { newlyUnlocked, total: count ?? 0 };
    } catch (err) {
      console.error('[Achievements] Check failed:', err);
      return { newlyUnlocked: [], total: 0 };
    } finally {
      setIsChecking(false);
    }
  }, [user, supabase, isChecking]);

  /**
   * Fetch all earned badges for the current user
   */
  const getEarnedBadges = useCallback(async (): Promise<Badge[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at, badges(id, name, description, icon, rarity)')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.badges.id,
        name: row.badges.name,
        description: row.badges.description,
        icon: row.badges.icon,
        rarity: row.badges.rarity,
        earned_at: row.earned_at,
      }));
    } catch (err) {
      console.error('[Achievements] Failed to fetch badges:', err);
      return [];
    }
  }, [user, supabase]);

  /**
   * Fetch all available badges (for display in achievements panel)
   */
  const getAllBadges = useCallback(async (): Promise<Array<Badge & { earned: boolean; earned_at?: string }>> => {
    if (!user) return [];
    try {
      const [{ data: all }, { data: earned }] = await Promise.all([
        supabase.from('badges').select('id, name, description, icon, rarity').order('rarity'),
        supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', user.id),
      ]);

      const earnedMap = new Map((earned ?? []).map(e => [e.badge_id, e.earned_at]));

      return (all ?? []).map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        rarity: b.rarity,
        earned: earnedMap.has(b.id),
        earned_at: earnedMap.get(b.id),
      }));
    } catch (err) {
      console.error('[Achievements] Failed to fetch all badges:', err);
      return [];
    }
  }, [user, supabase]);

  return {
    checkAchievements,
    getEarnedBadges,
    getAllBadges,
    isChecking,
  };
}
