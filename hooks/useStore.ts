import { useState, useEffect } from 'react';
import {
  calculateCompletedLessonXP, updateSRSCard, generateLeaderboardMock,
  generateHeatmapData, generateDailyQuests, generateDefaultBadges,
  evaluateQuests, checkBadgeUnlocks, calculateLeagueTier, getDaysUntilLeagueReset
} from '@evlo/core-logic';
import { SRSCard, Quest, Badge, Friend, Duel, StudyCircle, Story, StreakShield, LeagueTier } from '@evlo/types';
import { createClient } from '@/lib/supabase';
import { useAuth } from '../app/context/AuthContext';

const STORAGE_KEY = 'velmorth_state_v3';

const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return null;
  let target = dateStr;
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    const d = new Date(dateStr);
    target = getLocalDateString(d);
  }
  const parts = target.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
};

// --- Mock social data ---
const MOCK_FRIENDS: Friend[] = [
  { friend_id: 'f1', username: 'Sakura_99', avatar: '🌸', xp: 1240, streak: 12, status: 'accepted', lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), nudged_today: false },
  { friend_id: 'f2', username: 'TokyoDrift', avatar: '🏎️', xp: 890, streak: 5, status: 'accepted', lastActive: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), nudged_today: false },
  { friend_id: 'f3', username: 'NihongoKing', avatar: '👑', xp: 2100, streak: 30, status: 'pending', lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), nudged_today: false },
];

const MOCK_DUELS: Duel[] = [
  {
    duel_id: 'd1', challenger_id: 'me', challenger_name: 'You', challenger_avatar: '😊',
    opponent_id: 'f1', opponent_name: 'Sakura_99', opponent_avatar: '🌸',
    lesson_id: 'ja_u01_l01_hello_basic', challenger_score: 85, opponent_score: null,
    status: 'active', winner_id: null, xp_stake: 20,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  },
];

const MOCK_CIRCLES: StudyCircle[] = [
  {
    circle_id: 'c1', name: 'N5 Ninjas', description: 'JLPT N5 study group for beginners',
    avatar: '🥷', member_count: 24, weekly_xp: 4200,
    current_mission: 'Complete 50 lessons this week', mission_progress: 31, mission_target: 50,
    is_member: true,
  },
  {
    circle_id: 'c2', name: 'Kanji Crusaders', description: 'Dedicated to mastering Japanese kanji',
    avatar: '⛩️', member_count: 18, weekly_xp: 3100,
    current_mission: 'Review 200 SRS cards', mission_progress: 87, mission_target: 200,
    is_member: false,
  },
];

const MOCK_STORIES: Story[] = [
  {
    story_id: 's1', title: 'First Day in Tokyo', description: 'Navigate your first day in Japan',
    thumbnail: '🗼', difficulty: 'N5', estimated_minutes: 5, xp_reward: 30,
    tags: ['travel', 'greetings', 'N5'],
    is_locked: false, completed: false, completedAt: null,
    scenes: [
      {
        scene_id: 'sc1', background: '🏙️ Tokyo Station',
        dialogue: [
          { speaker: 'Station Staff', avatar: '👩', japanese: 'いらっしゃいませ！', romaji: 'Irasshaimase!', english: 'Welcome!', hindi: 'स्वागत है!' },
          { speaker: 'Station Staff', avatar: '👩', japanese: 'どちらへ行かれますか？', romaji: 'Dochira e ikaremasu ka?', english: 'Where are you going?', hindi: 'आप कहाँ जाना चाहते हैं?' },
        ],
        choices: [
          { choice_id: 'c1a', text_en: 'Shibuya, please', text_ja: 'しぶやへ、おねがいします', next_scene_id: 'sc2', xp_bonus: 10, is_correct: true },
          { choice_id: 'c1b', text_en: 'I don\'t know', text_ja: 'わかりません', next_scene_id: 'sc2', xp_bonus: 0, is_correct: false },
        ],
      },
      {
        scene_id: 'sc2', background: '🚇 Train Platform',
        dialogue: [
          { speaker: 'Velmorth AI', avatar: '🤖', japanese: 'よくできました！電車に乗りましょう。', romaji: 'Yoku dekimashita! Densha ni norimashou.', english: 'Well done! Let\'s board the train.', hindi: 'शाबाश! चलो ट्रेन में सवार होते हैं।' },
        ],
        is_end: true,
      },
    ],
  },
  {
    story_id: 's2', title: 'Ramen Shop Adventure', description: 'Order your favourite ramen in Japanese',
    thumbnail: '🍜', difficulty: 'N5', estimated_minutes: 7, xp_reward: 40,
    tags: ['food', 'ordering', 'N5'],
    is_locked: false, completed: false, completedAt: null,
    scenes: [
      {
        scene_id: 'r1', background: '🍜 Ramen Shop',
        dialogue: [
          { speaker: 'Chef', avatar: '👨‍🍳', japanese: 'いらっしゃいませ！何名様ですか？', romaji: 'Irasshaimase! Nanmei sama desu ka?', english: 'Welcome! How many people?', hindi: 'स्वागत है! कितने लोग?' },
        ],
        choices: [
          { choice_id: 'r1a', text_en: 'Just one person', text_ja: 'ひとりです', next_scene_id: 'r2', xp_bonus: 10, is_correct: true },
          { choice_id: 'r1b', text_en: 'I want ramen', text_ja: 'ラーメンをください', next_scene_id: 'r2', xp_bonus: 5, is_correct: false },
        ],
      },
      {
        scene_id: 'r2', background: '🍜 Ramen Shop',
        dialogue: [
          { speaker: 'Chef', avatar: '👨‍🍳', japanese: 'ありがとうございます！どうぞ。', romaji: 'Arigatou gozaimasu! Douzo.', english: 'Thank you! Please go ahead.', hindi: 'धन्यवाद! कृपया आगे बढ़ें।' },
        ],
        is_end: true,
      },
    ],
  },
  {
    story_id: 's3', title: 'Shopping in Harajuku', description: 'Buy clothes and accessories in Japanese',
    thumbnail: '🛍️', difficulty: 'N4', estimated_minutes: 10, xp_reward: 50,
    tags: ['shopping', 'N4'],
    is_locked: true, completed: false, completedAt: null,
    scenes: [],
  },
];

const DEFAULT_STATE = {
  username: 'Learner',
  avatar: '🦊',
  joinDate: new Date().toISOString(),
  xp: 0,
  gems: 50,
  hearts: 25,
  maxHearts: 25,
  heartsRecoverAt: null as string | null,
  heartsLastDebitAt: null as string | null,
  heartRecoveryHours: 24,
  streak: 0,
  lastStudyDate: null as string | null,
  lessonProgress: {} as Record<string, { completed: boolean; xp: number; completedAt: string }>,
  srsData: {} as Record<string, SRSCard>,
  activityLog: {} as Record<string, number>,
  theme: 'dark',
  uiLang: 'en',
  ttsEnabled: true,
  leaderboard: [] as any[],
  // --- New EVLO state ---
  quests: [] as Quest[],
  badges: [] as Badge[],
  weeklyXP: 0,
  leagueTier: 'bronze' as LeagueTier,
  streakShield: { active: false, uses_remaining: 0, max_uses: 3, activatedAt: null } as StreakShield,
  friends: MOCK_FRIENDS,
  duels: MOCK_DUELS,
  circles: MOCK_CIRCLES,
  stories: MOCK_STORIES,
  accuracyHistory: [] as number[],
  dailyLessonsCompleted: 0,
  dailyXPEarned: 0,
  dailyReviewsDone: 0,
  duelsWon: 0,
  storiesCompleted: 0,
  goalMinutes: 10,
};

export function useStore() {
  const { user } = useAuth();
  const [state, setState] = useState(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      let parsed = saved ? JSON.parse(saved) : {};

      // Seed leaderboard if empty
      if (!parsed.leaderboard || parsed.leaderboard.length === 0) {
        parsed.leaderboard = generateLeaderboardMock();
      }

      // Seed quests if empty
      if (!parsed.quests || parsed.quests.length === 0) {
        parsed.quests = generateDailyQuests();
      }

      // Seed badges if empty
      if (!parsed.badges || parsed.badges.length === 0) {
        parsed.badges = generateDefaultBadges();
      }

      // Always use fresh mock social data (no persistence needed for demo)
      parsed.friends = MOCK_FRIENDS;
      parsed.duels = MOCK_DUELS;
      parsed.circles = MOCK_CIRCLES;
      parsed.stories = parsed.stories || MOCK_STORIES;

      const merged = { ...DEFAULT_STATE, ...parsed };

      // Check streak
      if (merged.lastStudyDate) {
        const lastDate = parseLocalDate(merged.lastStudyDate);
        if (lastDate) {
          const todayDate = new Date();
          const d1 = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
          const d2 = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
          const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 1 && !merged.streakShield?.active) {
            merged.streak = 0;
          }
        }
      }

      // Recompute league tier
      merged.leagueTier = calculateLeagueTier(merged.weeklyXP || 0);

      setState(merged);
    } catch (e) {
      console.warn('Failed to load local state', e);
    }
    setIsLoaded(true);
  }, []);

  // Hydrate store state from Supabase when logged in
  useEffect(() => {
    if (!user) return;

    const hydrateFromSupabase = async () => {
      try {
        const supabase = createClient();
        
        // 0. Hydrate Settings
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('theme, ui_language, tts_enabled, goal_minutes')
          .eq('user_id', user.id)
          .maybeSingle();

        // 1. Hydrate User Stats & Streaks
        const { data: statsData } = await supabase
          .from('user_stats')
          .select('xp_total, gems_balance, hearts_total, hearts_max, hearts_recover_at, hearts_last_debit_at')
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: streakData } = await supabase
          .from('user_streaks')
          .select('streak, last_study_at')
          .eq('user_id', user.id)
          .maybeSingle();

        // 2. Hydrate Lesson Progress
        const { data: progData } = await supabase
          .from('lesson_progress')
          .select('lesson_id, status, xp_earned, completed_at')
          .eq('user_id', user.id);

        const lessonProgress: Record<string, any> = {};
        progData?.forEach(p => {
          lessonProgress[p.lesson_id] = {
            completed: p.status === 'completed',
            xp: p.xp_earned,
            completedAt: p.completed_at
          };
        });

        // 3. Hydrate Badges
        const { data: userBadgesData } = await supabase
          .from('user_badges')
          .select('badge_id, earned_at')
          .eq('user_id', user.id);

        const unlockedBadgeIds = new Set(userBadgesData?.map(b => b.badge_id) || []);
        const badges = state.badges.map(b => 
          unlockedBadgeIds.has(b.badge_id) 
            ? { ...b, unlockedAt: userBadgesData?.find(ub => ub.badge_id === b.badge_id)?.earned_at || new Date().toISOString() }
            : b
        );

        // 4. Hydrate review queue (SRS)
        const { data: srsList } = await supabase
          .from('review_queue')
          .select('*')
          .eq('user_id', user.id);

        const srsData: Record<string, any> = { ...state.srsData };
        srsList?.forEach(s => {
          srsData[s.word_id] = {
            cardId: s.word_id,
            vocab_id: s.word_id,
            ease: s.ease_factor,
            interval: s.interval_days,
            repetitions: s.repetitions,
            dueDate: s.next_review_at || s.due_at,
            lastReviewed: s.last_reviewed_at || s.last_reviewed,
            kanji: srsData[s.word_id]?.kanji || '',
            romaji: srsData[s.word_id]?.romaji || '',
            meaning_en: srsData[s.word_id]?.meaning_en || '',
            meaning_hi: srsData[s.word_id]?.meaning_hi || '',
          };
        });

        const finalTheme = (settingsData?.theme as any) ?? state.theme;
        if (finalTheme === 'system') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', finalTheme);
        }

        const updatedState = {
          ...state,
          theme: finalTheme,
          uiLang: (settingsData?.ui_language as any) ?? state.uiLang,
          ttsEnabled: settingsData?.tts_enabled ?? state.ttsEnabled,
          goalMinutes: settingsData?.goal_minutes ?? state.goalMinutes,
          xp: statsData?.xp_total ?? state.xp,
          gems: statsData?.gems_balance ?? state.gems,
          hearts: statsData?.hearts_total ?? state.hearts,
          maxHearts: statsData?.hearts_max ?? state.maxHearts,
          heartsRecoverAt: statsData?.hearts_recover_at ?? state.heartsRecoverAt,
          heartsLastDebitAt: statsData?.hearts_last_debit_at ?? state.heartsLastDebitAt,
          streak: streakData?.streak ?? state.streak,
          lastStudyDate: streakData?.last_study_at ?? state.lastStudyDate,
          lessonProgress,
          badges,
          srsData
        };

        save(updatedState);
      } catch (err) {
        console.error('Failed to hydrate store state from Supabase:', err);
      }
    };

    hydrateFromSupabase();
  }, [user]);

  const save = (newState: typeof state) => {
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
      console.warn('Failed to save local state', e);
    }
  };

  const addXP = (amount: number) => {
    const today = new Date().toISOString().split('T')[0];
    const log = { ...state.activityLog };
    log[today] = (log[today] || 0) + 1;

    const newWeeklyXP = (state.weeklyXP || 0) + amount;
    const updated = {
      ...state,
      xp: state.xp + amount,
      weeklyXP: newWeeklyXP,
      leagueTier: calculateLeagueTier(newWeeklyXP),
      dailyXPEarned: (state.dailyXPEarned || 0) + amount,
      activityLog: log,
    };
    save(updated);

    if (user) {
      createClient().from('user_stats').update({ xp_total: updated.xp }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing XP to Supabase:', error);
      }, err => console.error('Failed to sync XP to Supabase:', err));
    }

    return updated.xp;
  };

  const loseHeart = () => {
    if (state.hearts > 0) {
      const now = new Date();
      const newHearts = state.hearts - 1;
      let recoverAt = state.heartsRecoverAt;
      
      // If hearts were at max, start the recovery timer
      if (state.hearts === state.maxHearts) {
        const recoveryHours = state.heartRecoveryHours ?? 24;
        recoverAt = new Date(now.getTime() + recoveryHours * 60 * 60 * 1000).toISOString();
      }
      
      const updated = {
        ...state,
        hearts: newHearts,
        heartsRecoverAt: recoverAt,
        heartsLastDebitAt: now.toISOString()
      };
      save(updated);

      if (user) {
        createClient().from('user_stats').update({
          hearts_total: updated.hearts,
          hearts_recover_at: updated.heartsRecoverAt,
          hearts_last_debit_at: updated.heartsLastDebitAt
        }).eq('user_id', user.id).then(({ error }) => {
          if (error) console.error('Error syncing hearts details to Supabase:', error);
        }, err => console.error('Failed to sync hearts to Supabase:', err));
      }

      return updated.hearts;
    }
    return state.hearts;
  };

  const refillHearts = (customMax?: number) => {
    const targetMax = customMax ?? state.maxHearts;
    const updated = {
      ...state,
      maxHearts: targetMax,
      hearts: targetMax,
      heartsRecoverAt: null
    };
    save(updated);

    if (user) {
      createClient().from('user_stats').update({
        hearts_total: updated.hearts,
        hearts_max: updated.maxHearts,
        hearts_recover_at: null
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing refillHearts to Supabase:', error);
      }, err => console.error('Failed to sync refillHearts to Supabase:', err));
    }
  };

  const setHeartsState = (hearts: number, recoverAt: string | null, lastDebitAt?: string | null) => {
    const updated = {
      ...state,
      hearts,
      heartsRecoverAt: recoverAt,
      heartsLastDebitAt: lastDebitAt !== undefined ? lastDebitAt : state.heartsLastDebitAt
    };
    save(updated);

    if (user) {
      createClient().from('user_stats').update({
        hearts_total: hearts,
        hearts_recover_at: recoverAt,
        hearts_last_debit_at: updated.heartsLastDebitAt
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing setHeartsState to Supabase:', error);
      }, err => console.error('Failed to sync setHeartsState to Supabase:', err));
    }
  };

  const syncMaxHearts = (limit: number) => {
    if (limit && state.maxHearts !== limit) {
      const updated = {
        ...state,
        maxHearts: limit,
        hearts: state.hearts > limit ? limit : (state.maxHearts < limit ? limit : state.hearts)
      };
      save(updated);

      if (user) {
        createClient().from('user_stats').update({
          hearts_max: limit,
          hearts_total: updated.hearts
        }).eq('user_id', user.id).then(({ error }) => {
          if (error) console.error('Error syncing syncMaxHearts to Supabase:', error);
        }, err => console.error('Failed to sync syncMaxHearts to Supabase:', err));
      }
    }
  };

  const addGems = (amount: number) => {
    const updated = { ...state, gems: state.gems + amount };
    save(updated);

    if (user) {
      createClient().from('user_stats').update({ gems_balance: updated.gems }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing addGems to Supabase:', error);
      }, err => console.error('Failed to sync addGems to Supabase:', err));
    }
  };

  const spendGems = (amount: number) => {
    if (state.gems >= amount) {
      const updated = { ...state, gems: state.gems - amount };
      save(updated);

      if (user) {
        createClient().from('user_stats').update({ gems_balance: updated.gems }).eq('user_id', user.id).then(({ error }) => {
          if (error) console.error('Error syncing spendGems to Supabase:', error);
        }, err => console.error('Failed to sync spendGems to Supabase:', err));
      }

      return true;
    }
    return false;
  };

  const updateStreakOnLesson = () => {
    let newStreak = state.streak;
    const last = state.lastStudyDate;

    if (!last) {
      newStreak = 1;
    } else {
      const lastDate = parseLocalDate(last);
      if (lastDate) {
        const todayDate = new Date();
        const d1 = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
        const d2 = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }
    }

    return {
      streak: newStreak,
      lastStudyDate: getLocalDateString(),
    };
  };

  const completeLesson = (lessonId: string, xpReward: number) => {
    const progress = { ...(state.lessonProgress || {}) };
    const lessonResult = calculateCompletedLessonXP(lessonId, progress, xpReward);
    const xpGained = lessonResult.xpToAdd;
    const gemsGained = lessonResult.gemsToAdd;
    const streakUpdate = updateStreakOnLesson();

    progress[lessonId] = {
      completed: true,
      xp: xpReward,
      completedAt: new Date().toISOString(),
    };

    const today = new Date().toISOString().split('T')[0];
    const log = { ...state.activityLog };
    log[today] = (log[today] || 0) + 1;

    const newWeeklyXP = (state.weeklyXP || 0) + xpGained;
    const newDailyLessons = (state.dailyLessonsCompleted || 0) + 1;
    const newDailyXP = (state.dailyXPEarned || 0) + xpGained;
    const newAccuracy = [...(state.accuracyHistory || []), xpGained / Math.max(xpReward, 1)];

    // Evaluate quests
    const updatedQuests = evaluateQuests(state.quests || [], {
      lessonsCompleted: newDailyLessons,
      xpEarned: newDailyXP,
      reviewsDone: state.dailyReviewsDone || 0,
      streakDays: streakUpdate.streak,
    });

    // Check badge unlocks
    const completedCount = Object.keys(progress).length;
    const updatedBadges = checkBadgeUnlocks(state.badges || [], {
      streak: streakUpdate.streak,
      totalXP: state.xp + xpGained,
      lessonsCompleted: completedCount,
      friendCount: (state.friends || []).filter(f => f.status === 'accepted').length,
      duelsWon: state.duelsWon || 0,
      storiesCompleted: state.storiesCompleted || 0,
    });

    const updated = {
      ...state,
      xp: state.xp + xpGained,
      gems: state.gems + gemsGained,
      weeklyXP: newWeeklyXP,
      leagueTier: calculateLeagueTier(newWeeklyXP),
      streak: streakUpdate.streak,
      lastStudyDate: streakUpdate.lastStudyDate,
      lessonProgress: progress,
      activityLog: log,
      quests: updatedQuests,
      badges: updatedBadges,
      dailyLessonsCompleted: newDailyLessons,
      dailyXPEarned: newDailyXP,
      accuracyHistory: newAccuracy.slice(-30), // keep last 30 days
    };
    save(updated);

    if (user) {
      const supabase = createClient();
      
      // 1. Sync lesson progress
      supabase.from('lesson_progress').upsert({
        user_id: user.id,
        lesson_id: lessonId,
        status: 'completed',
        xp_earned: xpReward,
        completed_at: new Date().toISOString()
      }, { onConflict: 'user_id,lesson_id' }).then(({ error }) => {
        if (error) console.error('Error syncing lesson progress to Supabase:', error);
      }, err => console.error('Failed to sync lesson progress:', err));

      // 2. Sync user stats
      supabase.from('user_stats').update({
        xp_total: updated.xp,
        gems_balance: updated.gems,
        lessons_done: completedCount
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing stats after lesson to Supabase:', error);
      }, err => console.error('Failed to sync stats after lesson:', err));

      // 3. Sync streak
      supabase.from('user_streaks').select('longest').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        const currentLongest = data?.longest || 0;
        const newLongest = Math.max(currentLongest, updated.streak);
        supabase.from('user_streaks').update({
          streak: updated.streak,
          longest: newLongest,
          last_study_at: getLocalDateString()
        }).eq('user_id', user.id).then(({ error }) => {
          if (error) console.error('Error syncing streak to Supabase:', error);
        }, err => console.error('Failed to update streak:', err));
      }, err => console.error('Failed to fetch longest streak:', err));

      // 4. Sync badges
      const newlyUnlocked = updated.badges.filter((b, idx) => {
        const oldB = (state.badges || [])[idx];
        return b.unlockedAt && (!oldB || !oldB.unlockedAt);
      });
      newlyUnlocked.forEach(badge => {
        supabase.from('user_badges').insert({
          user_id: user.id,
          badge_id: badge.badge_id,
          earned_at: badge.unlockedAt
        }).then(({ error }) => {
          if (error) console.error('Error syncing newly unlocked badge to Supabase:', error);
        }, err => console.error('Failed to insert unlocked badge:', err));
      });
    }
  };

  const handleSRSCardUpdate = (vocab: any, quality: number) => {
    const currentCard = (state.srsData || {})[vocab.vocab_id] || null;
    const result = updateSRSCard(currentCard, quality);

    const srsData = { ...(state.srsData || {}) };
    srsData[vocab.vocab_id] = {
      cardId: vocab.vocab_id,
      vocab_id: vocab.vocab_id,
      kanji: vocab.kanji,
      romaji: vocab.romaji,
      meaning_en: vocab.meaning_en,
      meaning_hi: vocab.meaning_hi,
      ...result,
    };

    // Update review count for quests
    const newDailyReviews = (state.dailyReviewsDone || 0) + 1;
    const updatedQuests = evaluateQuests(state.quests || [], {
      lessonsCompleted: state.dailyLessonsCompleted || 0,
      xpEarned: state.dailyXPEarned || 0,
      reviewsDone: newDailyReviews,
      streakDays: state.streak,
    });

    const updated = { ...state, srsData, dailyReviewsDone: newDailyReviews, quests: updatedQuests };
    save(updated);

    if (user) {
      const supabase = createClient();
      
      // Sync to review_queue
      supabase.from('review_queue').upsert({
        user_id: user.id,
        word_id: vocab.vocab_id,
        ease_factor: result.ease,
        interval_days: result.interval,
        repetitions: result.repetitions,
        next_review_at: result.dueDate,
        last_reviewed_at: new Date().toISOString()
      }, { onConflict: 'user_id,word_id' }).then(({ error }) => {
        if (error) console.error('Error syncing review queue update to Supabase:', error);
      }, err => console.error('Failed to sync review queue update:', err));

      // Update reviews_done in user_stats
      supabase.from('user_stats').update({
        reviews_done: newDailyReviews
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing reviews_done increment to Supabase:', error);
      }, err => console.error('Failed to sync reviews_done increment:', err));
    }
  };

  const setTheme = (theme: 'dark' | 'light' | 'system') => {
    const updated = { ...state, theme };
    save(updated);
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }

    if (user) {
      createClient().from('user_settings').update({ theme }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing theme to Supabase:', error);
      });
    }
  };

  const setUILang = (uiLang: 'en' | 'hi') => {
    const updated = { ...state, uiLang };
    save(updated);

    if (user) {
      createClient().from('user_settings').update({ ui_language: uiLang }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing UI language to Supabase:', error);
      });
    }
  };

  const toggleTTS = () => {
    const updated = { ...state, ttsEnabled: !state.ttsEnabled };
    save(updated);

    if (user) {
      createClient().from('user_settings').update({ tts_enabled: updated.ttsEnabled }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing TTS state to Supabase:', error);
      });
    }

    return updated.ttsEnabled;
  };

  const getLeaderboardList = () => {
    const myEntry = {
      name: state.username,
      avatar: state.avatar,
      xp: state.xp,
      isYou: true,
    };
    return [...state.leaderboard, myEntry]
      .sort((a, b) => b.xp - a.xp)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  };

  const getHeatmapList = () => {
    return generateHeatmapData(state.activityLog);
  };

  // --- New actions ---

  const claimQuest = (questId: string) => {
    const quests = (state.quests || []).map(q =>
      q.quest_id === questId && q.status === 'completed'
        ? { ...q, status: 'claimed' as const }
        : q
    );
    const quest = (state.quests || []).find(q => q.quest_id === questId);
    const xpBonus = quest?.xp_reward || 0;
    const gemBonus = quest?.gem_reward || 0;
    const updated = {
      ...state,
      quests,
      xp: state.xp + xpBonus,
      gems: state.gems + gemBonus,
    };
    save(updated);

    if (user) {
      createClient().from('user_stats').update({
        xp_total: updated.xp,
        gems_balance: updated.gems
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing claimed quest rewards to Supabase:', error);
      }, err => console.error('Failed to sync claimed quest rewards:', err));
    }
  };

  const nudgeFriend = (friendId: string) => {
    const friends = (state.friends || []).map(f =>
      f.friend_id === friendId ? { ...f, nudged_today: true } : f
    );
    save({ ...state, friends });
  };

  const addFriend = (username: string) => {
    const newFriend: Friend = {
      friend_id: `f-${Date.now()}`,
      username,
      avatar: '👤',
      xp: 0,
      streak: 0,
      status: 'pending',
      lastActive: new Date().toISOString(),
      nudged_today: false,
    };
    save({ ...state, friends: [...(state.friends || []), newFriend] });
  };

  const challengeDuel = (friendId: string) => {
    const friend = (state.friends || []).find(f => f.friend_id === friendId);
    if (!friend) return;
    const newDuel: Duel = {
      duel_id: `d-${Date.now()}`,
      challenger_id: 'me',
      challenger_name: state.username,
      challenger_avatar: state.avatar,
      opponent_id: friendId,
      opponent_name: friend.username,
      opponent_avatar: friend.avatar,
      lesson_id: 'ja_u01_l01_hello_basic',
      challenger_score: null,
      opponent_score: null,
      status: 'pending',
      winner_id: null,
      xp_stake: 20,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    save({ ...state, duels: [...(state.duels || []), newDuel] });
  };

  const joinCircle = (circleId: string) => {
    const circles = (state.circles || []).map(c =>
      c.circle_id === circleId ? { ...c, is_member: true, member_count: c.member_count + 1 } : c
    );
    save({ ...state, circles });
  };

  const completeStory = (storyId: string, xpReward: number) => {
    const stories = (state.stories || []).map(s =>
      s.story_id === storyId ? { ...s, completed: true, completedAt: new Date().toISOString() } : s
    );
    const newStoriesCompleted = (state.storiesCompleted || 0) + 1;
    const updatedBadges = checkBadgeUnlocks(state.badges || [], {
      streak: state.streak,
      totalXP: state.xp + xpReward,
      lessonsCompleted: Object.keys(state.lessonProgress || {}).length,
      friendCount: (state.friends || []).filter(f => f.status === 'accepted').length,
      duelsWon: state.duelsWon || 0,
      storiesCompleted: newStoriesCompleted,
    });
    const updated = {
      ...state,
      stories,
      storiesCompleted: newStoriesCompleted,
      xp: state.xp + xpReward,
      badges: updatedBadges,
    };
    save(updated);

    if (user) {
      const supabase = createClient();
      
      supabase.from('user_stats').update({
        xp_total: updated.xp
      }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing stats after story to Supabase:', error);
      }, err => console.error('Failed to sync stats after story:', err));

      const newlyUnlocked = updated.badges.filter((b, idx) => {
        const oldB = (state.badges || [])[idx];
        return b.unlockedAt && (!oldB || !oldB.unlockedAt);
      });
      newlyUnlocked.forEach(badge => {
        supabase.from('user_badges').insert({
          user_id: user.id,
          badge_id: badge.badge_id,
          earned_at: badge.unlockedAt
        }).then(({ error }) => {
          if (error) console.error('Error syncing badge to Supabase:', error);
        }, err => console.error('Failed to sync badge to Supabase:', err));
      });
    }
  };

  const activateStreakShield = () => {
    if (state.gems >= 10) {
      const updated = {
        ...state,
        gems: state.gems - 10,
        streakShield: { active: true, uses_remaining: 1, max_uses: 1, activatedAt: new Date().toISOString() },
      };
      save(updated);

      if (user) {
        createClient().from('user_stats').update({
          gems_balance: updated.gems
        }).eq('user_id', user.id).then(({ error }) => {
          if (error) console.error('Error syncing streak shield activation to Supabase:', error);
        });
      }

      return true;
    }
    return false;
  };

  const setGoalMinutes = (minutes: number) => {
    const updated = { ...state, goalMinutes: minutes };
    save(updated);

    if (user) {
      createClient().from('user_settings').update({ goal_minutes: minutes }).eq('user_id', user.id).then(({ error }) => {
        if (error) console.error('Error syncing goal minutes to Supabase:', error);
      });
    }
  };

  return {
    state,
    isLoaded,
    addXP,
    loseHeart,
    refillHearts,
    syncMaxHearts,
    setHeartsState,
    addGems,
    spendGems,
    completeLesson,
    handleSRSCardUpdate,
    setTheme,
    setUILang,
    toggleTTS,
    getLeaderboardList,
    getHeatmapList,
    // New actions
    claimQuest,
    nudgeFriend,
    addFriend,
    challengeDuel,
    joinCircle,
    completeStory,
    activateStreakShield,
    setGoalMinutes,
  };
}
