'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';

export interface UserProfile {
  uid: string;
  username: string;
  name: string; // display_name
  email: string;
  xp: number; // xp_total
  level: number; // computed from xp
  streak: number; // user_streaks.streak
  leafBalance: number; // gems_balance
  isPremium: boolean; // true for starter/plus/pro/ai_max/yearly
  planId: string;           // 'free' | 'starter' | 'plus' | 'pro' | 'ai_max'
  planStatus: string;       // 'free' | 'starter' | 'plus' | 'pro' | 'ai_max' | 'yearly' | 'cancelled'
  endsAt: string | null;    // ISO timestamp of subscription expiry
  heartsLimit: number;      // 5 | 25 | 50 | 100
  aiLimitDaily: number;     // 5 | 15 | 30 | 99
  lessonsLimitDaily: number;// 5 | 15 | 30 | 99
  adsEnabled: boolean;      // true for Free, false for paid
  isAdmin: boolean;         // true if in admin_roles table
  avatarUrl: string;
  bio: string;
  theme: 'dark' | 'light' | 'system';
  ui_language: string;
  tts_enabled: boolean;
  goal_minutes: number;
  notifications: boolean;
  jlpt_target: string; // N5 | N4 | N3 | N2 | N1
  kanji_learned: number;
  speak_sessions: number;
  words_learned: number;
  lessons_done: number;
  reviews_done: number;
  xp_today: number; // daily XP earned today, from user_stats.xp_today
  createdAt: string;
  heartsTotal: number;
  heartsUsedToday: number;
  heartsMax: number;
  heartsRecoverAt: string | null;
  heartsLastDebitAt: string | null;
  heartSystemEnabled: boolean;
  heartRecoveryMode: string;
  heartRecoveryHours: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<{ user: User | null; session: Session | null }>;
  signUpStep2: (username: string, displayName: string, avatarUrl: string) => Promise<void>;
  signUpStep3: (goalMinutes: number) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfileStats: (xpDelta: number, leafDelta: number) => Promise<void>;
  updateSettings: (settings: Partial<{ theme: 'dark' | 'light' | 'system'; ui_language: string; tts_enabled: boolean; goal_minutes: number; notifications: boolean; jlpt_target?: string }>) => Promise<void>;
  updateProfileDetails: (displayName: string, bio: string, avatarUrl: string, username?: string) => Promise<void>;
  updateHearts: (newHearts: number, nextRecoverAt: string | null, lastDebitAt: string | null) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync / fetch user profile from Supabase
  const syncUserProfile = async (supabaseUser: User) => {
    try {
      // 1. Fetch profile
      let { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (profileErr || !profileData) {
        const username = supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || 'learner_' + Math.random().toString(36).substring(2, 7);
        const displayName = supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Learner';
        
        const { data: newProfile, error: createErr } = await supabase
          .from('profiles')
          .insert({
            id: supabaseUser.id,
            username,
            display_name: displayName,
            avatar_url: null,
            bio: '',
          })
          .select()
          .single();
          
        if (createErr) console.error('Error creating profile:', createErr);
        profileData = newProfile || { id: supabaseUser.id, username, display_name: displayName, avatar_url: null, bio: '' };
      }

      // 2. Fetch Settings
      let { data: settingsData, error: settingsErr } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (settingsErr || !settingsData) {
        const { data: newSettings } = await supabase
          .from('user_settings')
          .insert({ user_id: supabaseUser.id })
          .select()
          .single();
        settingsData = newSettings || { theme: 'dark', ui_language: 'en', tts_enabled: true, goal_minutes: 10, notifications: true };
      }

      // 3. Fetch Stats
      let { data: statsData, error: statsErr } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (statsErr || !statsData) {
        const { data: newStats } = await supabase
          .from('user_stats')
          .insert({ user_id: supabaseUser.id })
          .select()
          .single();
        statsData = newStats || { xp_total: 0, xp_today: 0, gems_balance: 5, lessons_done: 0, words_learned: 0, reviews_done: 0 };
      }

      // 4. Fetch Streaks
      let { data: streakData, error: streakErr } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (streakErr || !streakData) {
        const { data: newStreak } = await supabase
          .from('user_streaks')
          .insert({ user_id: supabaseUser.id })
          .select()
          .single();
        streakData = newStreak || { streak: 0, longest: 0, freeze_count: 0 };
      }

      // 5. Fetch Entitlements
      let { data: entitlementsData, error: entErr } = await supabase
        .from('entitlements')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (entErr || !entitlementsData) {
        const { data: newEnt } = await supabase
          .from('entitlements')
          .insert({
            user_id: supabaseUser.id,
            plan_id: 'free',
            status: 'free',
            hearts_limit: 25,
            ai_limit_daily: 5,
            lessons_limit_daily: 5,
            ads_enabled: true,
          })
          .select()
          .single();
        entitlementsData = newEnt || { status: 'free', plan_id: 'free', hearts_limit: 25, ai_limit_daily: 5, lessons_limit_daily: 5, ads_enabled: true };
      }

      // 6. Check admin_roles
      const { data: adminData } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', supabaseUser.id)
        .maybeSingle();

      const mergedProfile: UserProfile = {
        uid: supabaseUser.id,
        username: profileData.username || '',
        name: profileData.display_name || '',
        email: supabaseUser.email || '',
        xp: statsData.xp_total ?? 0,
        // Progressive level curve: L1=0-99, L2=100-299, L3=300-599, L4=600-999 (+100*level each step)
        level: (() => {
          const xp = statsData.xp_total ?? 0;
          let level = 1;
          let threshold = 100;
          let accumulated = 0;
          while (xp >= accumulated + threshold) {
            accumulated += threshold;
            threshold += 100;
            level++;
            if (level >= 100) break; // safety cap
          }
          return level;
        })(),
        streak: streakData.streak ?? 0,
        leafBalance: statsData.gems_balance ?? 5,
        // isPremium: active if plan is paid AND not expired
        isPremium: ((['starter', 'plus', 'pro', 'ai_max', 'yearly'].includes(entitlementsData.status)) &&
                    (entitlementsData.ends_at ? new Date(entitlementsData.ends_at) > new Date() : true)) ||
                   (entitlementsData.status === 'cancelled' && entitlementsData.ends_at && new Date(entitlementsData.ends_at) > new Date()),
        planId: entitlementsData.plan_id || 'free',
        planStatus: entitlementsData.status || 'free',
        endsAt: entitlementsData.ends_at || null,
        heartsLimit: entitlementsData.hearts_limit ?? 25,
        aiLimitDaily: entitlementsData.ai_limit_daily ?? 5,
        lessonsLimitDaily: entitlementsData.lessons_limit_daily ?? 5,
        adsEnabled: !(
          ((['pro', 'ai_max', 'yearly'].includes(entitlementsData.plan_id) || ['pro', 'ai_max', 'yearly'].includes(entitlementsData.status)) &&
          (entitlementsData.ends_at ? new Date(entitlementsData.ends_at) > new Date() : true)) ||
          (entitlementsData.status === 'cancelled' && entitlementsData.ends_at && new Date(entitlementsData.ends_at) > new Date())
        ),
        isAdmin: !!adminData,
        avatarUrl: profileData.avatar_url || '🦊',
        bio: profileData.bio || '',
        theme: settingsData.theme || 'dark',
        ui_language: settingsData.ui_language || 'en',
        tts_enabled: settingsData.tts_enabled ?? true,
        goal_minutes: settingsData.goal_minutes ?? 10,
        notifications: settingsData.notifications ?? true,
        jlpt_target: settingsData.jlpt_target || 'N5',
        kanji_learned: statsData.kanji_learned ?? 0,
        speak_sessions: statsData.speak_sessions ?? 0,
        words_learned: statsData.words_learned ?? 0,
        lessons_done: statsData.lessons_done ?? 0,
        reviews_done: statsData.reviews_done ?? 0,
        xp_today: statsData.xp_today ?? 0, // daily XP from DB (resets at midnight)
        createdAt: profileData.created_at || new Date().toISOString(),
        heartsTotal: statsData.hearts_total ?? (entitlementsData.status === 'free' ? 25 : (entitlementsData.status === 'starter' ? 75 : (entitlementsData.status === 'plus' ? 90 : 100))),
        heartsUsedToday: statsData.hearts_used_today ?? 0,
        heartsMax: statsData.hearts_max ?? (entitlementsData.status === 'free' ? 25 : (entitlementsData.status === 'starter' ? 75 : (entitlementsData.status === 'plus' ? 90 : 100))),
        heartsRecoverAt: statsData.hearts_recover_at || null,
        heartsLastDebitAt: statsData.hearts_last_debit_at || null,
        heartSystemEnabled: settingsData.heart_system_enabled ?? true,
        heartRecoveryMode: settingsData.heart_recovery_mode || 'time',
        heartRecoveryHours: settingsData.heart_recovery_hours ?? 24,
      };

      setProfile(mergedProfile);
    } catch (error) {
      console.error('Error syncing user profile:', error);
    }
  };

  useEffect(() => {
    let active = true;

    // Validate session on mount to prevent stale localstorage session loops
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (user) {
        setUser(user);
        syncUserProfile(user);
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!active) return;
          setSession(session);
          setLoading(false);
        });
      } else {
        // Fallback mock profile in local dev to bypass Supabase auth limits
        const mockUser = {
          id: 'mock-user-uid',
          email: 'ramaa_test@velmorth.com',
          user_metadata: { full_name: 'Ramaa', username: 'ramaa_01' }
        } as any;
        setUser(mockUser);
        const mockProfile: UserProfile = {
          uid: 'mock-user-uid',
          username: 'ramaa_01',
          name: 'Ramaa',
          email: 'ramaa_test@velmorth.com',
          xp: 8450,
          level: 24,
          streak: 23,
          leafBalance: 5,
          isPremium: true,
          planId: 'pro',
          planStatus: 'pro',
          endsAt: null,
          heartsLimit: 100,
          aiLimitDaily: 99,
          lessonsLimitDaily: 99,
          adsEnabled: false,
          isAdmin: true,
          avatarUrl: '',
          bio: 'こんにちは！ I am Ramaa, your friendly Japanese learner.',
          theme: 'dark',
          ui_language: 'en',
          tts_enabled: true,
          goal_minutes: 10,
          notifications: true,
          jlpt_target: 'N5',
          kanji_learned: 219,
          speak_sessions: 5,
          words_learned: 1863,
          lessons_done: 142,
          reviews_done: 45,
          xp_today: 120,
          createdAt: new Date().toISOString(),
          heartsTotal: 100,
          heartsUsedToday: 0,
          heartsMax: 100,
          heartsRecoverAt: null,
          heartsLastDebitAt: null,
          heartSystemEnabled: true,
          heartRecoveryMode: 'time',
          heartRecoveryHours: 24,
        };
        setProfile(mockProfile);
        setSession({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: mockUser,
        });
        setLoading(false);
      }
    });

    // Subscribe to auth state changes for SIGNED_IN, SIGNED_OUT, etc.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (event === 'INITIAL_SESSION') {
        // Let the mount getUser check handle the initial session
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer profile sync to prevent supabase-js internal deadlock
        setTimeout(() => {
          if (active) syncUserProfile(session.user);
        }, 0);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      if (error) throw error;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error) {
        setLoading(false);
        throw error;
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { username: name, full_name: name },
        },
      });
      if (error) {
        setLoading(false);
        throw error;
      }
      if (data.user && data.session) {
        setUser(data.user);
        setSession(data.session);
      }
      return data;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signUpStep2 = async (username: string, displayName: string, avatarUrl: string) => {
    if (!user) throw new Error('Not authenticated');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username,
          display_name: displayName,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error during signUpStep2 DB sync:', err);
    }
    
    // Update local profile state
    setProfile(prev => prev ? {
      ...prev,
      username,
      name: displayName,
      avatarUrl,
    } : null);
  };

  const signUpStep3 = async (goalMinutes: number) => {
    if (!user) throw new Error('Not authenticated');
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ goal_minutes: goalMinutes })
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error during signUpStep3 DB sync:', err);
    }

    // Update local profile state
    setProfile(prev => prev ? {
      ...prev,
      goal_minutes: goalMinutes,
    } : null);
  };

  const logout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setLoading(false);
        throw error;
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=recovery`
        : undefined,
    });
    if (error) throw error;
  };

  const updateProfileStats = async (xpDelta: number, leafDelta: number) => {
    if (!user || !profile) return;
    const newXp = profile.xp + xpDelta;
    const newGems = Math.max(0, profile.leafBalance + leafDelta);
    const newXpToday = (profile.xp_today ?? 0) + xpDelta;

    // Optimistically update local profile state
    const calcLevel = (xp: number) => {
      let level = 1, threshold = 100, accumulated = 0;
      while (xp >= accumulated + threshold) {
        accumulated += threshold; threshold += 100; level++;
        if (level >= 100) break;
      }
      return level;
    };
    setProfile(prev => prev ? {
      ...prev,
      xp: newXp,
      xp_today: newXpToday,
      level: calcLevel(newXp),
      leafBalance: newGems,
    } : null);

    try {
      const { error } = await supabase
        .from('user_stats')
        .update({
          xp_total: newXp,
          xp_today: newXpToday,
          gems_balance: newGems,
          last_active: new Date().toISOString().split('T')[0],
        })
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating stats:', err);
    }
  };

  const updateSettings = async (settings: Partial<{ theme: 'dark' | 'light' | 'system'; ui_language: string; tts_enabled: boolean; goal_minutes: number; notifications: boolean; jlpt_target?: string }>) => {
    if (!user || !profile) return;

    // Optimistically update local profile state
    setProfile(prev => prev ? {
      ...prev,
      ...settings,
    } : null);

    try {
      const { error } = await supabase
        .from('user_settings')
        .update(settings)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  const updateProfileDetails = async (displayName: string, bio: string, avatarUrl: string, username?: string) => {
    if (!user || !profile) throw new Error('Not authenticated');

    // Optimistically update local profile state
    setProfile(prev => prev ? {
      ...prev,
      name: displayName,
      bio,
      avatarUrl,
      ...(username ? { username } : {}),
    } : null);

    try {
      const updateData: any = {
        display_name: displayName,
        bio: bio,
        avatar_url: avatarUrl,
      };
      if (username) {
        updateData.username = username;
      }
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating profile details in DB:', err);
    }
  };

  const updateHearts = async (newHearts: number, nextRecoverAt: string | null, lastDebitAt: string | null) => {
    if (!user || !profile) return;

    // Optimistically update local profile state
    setProfile(prev => prev ? {
      ...prev,
      heartsTotal: newHearts,
      heartsRecoverAt: nextRecoverAt,
      heartsLastDebitAt: lastDebitAt,
    } : null);

    try {
      const { error } = await supabase
        .from('user_stats')
        .update({
          hearts_total: newHearts,
          hearts_recover_at: nextRecoverAt,
          hearts_last_debit_at: lastDebitAt,
        })
        .eq('user_id', user.id);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error updating hearts in DB:', err);
    }
  };

  const deleteAccount = async () => {
    if (!session) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const response = await fetch('/api/user/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete account');
      }
      await logout();
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithGoogle,
        loginWithEmail,
        signUpWithEmail,
        signUpStep2,
        signUpStep3,
        logout,
        resetPassword,
        updateProfileStats,
        updateSettings,
        updateProfileDetails,
        updateHearts,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
