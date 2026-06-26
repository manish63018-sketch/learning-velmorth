import { SRSCard, Quest, Badge, LeagueTier, MistakeCluster, DifficultyLevel, AdaptiveDifficulty } from "../types";

// SM-2 Spaced Repetition Algorithm (quality: 0=hard, 1=ok, 2=easy)
export function updateSRSCard(card: Omit<SRSCard, "vocab_id" | "kanji" | "romaji" | "meaning_en" | "meaning_hi" | "cardId"> | null, quality: number): {
  ease: number;
  interval: number;
  repetitions: number;
  dueDate: string;
} {
  const currentCard = card || {
    ease: 2.5,
    interval: 1,
    repetitions: 0,
    dueDate: new Date().toISOString(),
  };

  let { ease, interval, repetitions } = currentCard;
  const easeMap = [0, 0.15, 0.3];
  const easeChange = easeMap[quality] ?? 0;

  if (quality === 0) {
    interval = 1;
    repetitions = 0;
  } else if (quality === 1) {
    interval = Math.max(1, interval);
    repetitions += 1;
  } else {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * ease);
    repetitions += 1;
  }

  ease = Math.max(1.3, ease + easeChange);
  const due = new Date();
  due.setDate(due.getDate() + interval);

  return {
    ease,
    interval,
    repetitions,
    dueDate: due.toISOString(),
  };
}

// Streak Validation Helper
export function checkStreakBroken(lastStudyDate: string | null, currentStreak: number): number {
  if (!lastStudyDate) return 0;
  const lastDate = new Date(lastStudyDate);
  const diffDays = Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 1) {
    return 0; // Streak broken
  }
  return currentStreak;
}

// XP/Streak update on completion
export function calculateCompletedLessonXP(lessonId: string, completedLessons: Record<string, any>, xpReward: number): {
  xpToAdd: number;
  gemsToAdd: number;
  shouldIncrementStreak: boolean;
} {
  const isAlreadyCompleted = !!completedLessons[lessonId];
  if (!isAlreadyCompleted) {
    return {
      xpToAdd: xpReward,
      gemsToAdd: 5,
      shouldIncrementStreak: true
    };
  } else {
    return {
      xpToAdd: Math.floor(xpReward / 2),
      gemsToAdd: 0,
      shouldIncrementStreak: true
    };
  }
}

// Heatmap generator helper
export function generateHeatmapData(activityLog: Record<string, number>, weeks: number = 13): Array<{ date: string; sessions: number; level: number }> {
  const cells = [];
  const today = new Date();
  const totalDays = weeks * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const sessions = activityLog[key] || 0;
    cells.push({ date: key, sessions, level: Math.min(4, sessions) });
  }
  return cells;
}

// Mock Leaderboard
export function generateLeaderboardMock(): Array<{ name: string; avatar: string; xp: number; rank: number; isYou: boolean }> {
  const names = [
    { name: "Sakura_99", avatar: "🌸" },
    { name: "TokyoDrift", avatar: "🏎️" },
    { name: "NihongoKing", avatar: "👑" },
    { name: "ArigatouGuy", avatar: "🎌" },
    { name: "KanjiMaster", avatar: "⛩️" },
    { name: "Yuki_learns", avatar: "❄️" },
    { name: "Sensei_Pro", avatar: "🎓" },
    { name: "MangaFan2k", avatar: "📚" },
    { name: "OsakaVibes", avatar: "🦌" },
  ];
  return names.map((n, i) => ({
    ...n,
    xp: Math.floor(Math.random() * 800) + 200 - i * 40,
    rank: i + 1,
    isYou: false,
  }));
}

// ===== GAMIFICATION LOGIC =====

// Evaluate which daily/weekly quests are now complete
export function evaluateQuests(
  quests: Quest[],
  stats: { lessonsCompleted: number; xpEarned: number; reviewsDone: number; streakDays: number }
): Quest[] {
  return quests.map(quest => {
    let progress = quest.progress;
    if (quest.quest_id === 'q_lessons_today') progress = stats.lessonsCompleted;
    if (quest.quest_id === 'q_xp_today') progress = stats.xpEarned;
    if (quest.quest_id === 'q_reviews_today') progress = stats.reviewsDone;
    if (quest.quest_id === 'q_streak_week') progress = stats.streakDays;

    const newStatus: Quest['status'] =
      progress >= quest.target && quest.status === 'active' ? 'completed' : quest.status;

    return { ...quest, progress, status: newStatus };
  });
}

// Generate default daily quests
export function generateDailyQuests(): Quest[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const expiresAt = tomorrow.toISOString();

  return [
    {
      quest_id: 'q_lessons_today',
      title: 'Lesson Sprint',
      description: 'Complete 3 lessons today',
      type: 'daily',
      xp_reward: 20,
      gem_reward: 5,
      icon: '📚',
      target: 3,
      progress: 0,
      status: 'active',
      expiresAt,
    },
    {
      quest_id: 'q_xp_today',
      title: 'XP Chaser',
      description: 'Earn 50 XP today',
      type: 'daily',
      xp_reward: 15,
      gem_reward: 3,
      icon: '⚡',
      target: 50,
      progress: 0,
      status: 'active',
      expiresAt,
    },
    {
      quest_id: 'q_reviews_today',
      title: 'Memory Master',
      description: 'Review 10 flashcards',
      type: 'daily',
      xp_reward: 10,
      gem_reward: 2,
      icon: '🧠',
      target: 10,
      progress: 0,
      status: 'active',
      expiresAt,
    },
  ];
}

// Streak shield logic
export function calcStreakShieldUsage(
  streakBroken: boolean,
  shield: { active: boolean; uses_remaining: number }
): { shieldUsed: boolean; streakSaved: boolean; newUsesRemaining: number } {
  if (streakBroken && shield.active && shield.uses_remaining > 0) {
    return {
      shieldUsed: true,
      streakSaved: true,
      newUsesRemaining: shield.uses_remaining - 1,
    };
  }
  return { shieldUsed: false, streakSaved: false, newUsesRemaining: shield.uses_remaining };
}

// Compute league tier from weekly XP
export function calculateLeagueTier(weeklyXP: number): LeagueTier {
  if (weeklyXP >= 2000) return 'obsidian';
  if (weeklyXP >= 1000) return 'diamond';
  if (weeklyXP >= 500) return 'platinum';
  if (weeklyXP >= 250) return 'gold';
  if (weeklyXP >= 100) return 'silver';
  return 'bronze';
}

// Get promotion/demotion thresholds for a tier
export function getLeagueThresholds(tier: LeagueTier): { promotion: number; demotion: number } {
  const thresholds: Record<LeagueTier, { promotion: number; demotion: number }> = {
    bronze: { promotion: 100, demotion: 0 },
    silver: { promotion: 250, demotion: 80 },
    gold: { promotion: 500, demotion: 200 },
    platinum: { promotion: 1000, demotion: 400 },
    diamond: { promotion: 2000, demotion: 800 },
    obsidian: { promotion: Infinity, demotion: 1500 },
  };
  return thresholds[tier];
}

// Get days until league season reset (weekly, resets Monday midnight)
export function getDaysUntilLeagueReset(): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return daysUntilMonday;
}

// ===== INTELLIGENCE: WEAK WORD CLUSTERING =====

// Cluster SRS cards by error rate to identify weak areas
export function clusterWeakWords(
  srsData: Record<string, SRSCard & { errorCount?: number }>
): MistakeCluster[] {
  const cards = Object.values(srsData);
  const weakCards = cards.filter(c => (c.errorCount || 0) > 1 || c.ease < 1.8);

  if (weakCards.length === 0) return [];

  // Group by ease factor buckets
  const clusters: MistakeCluster[] = [
    {
      cluster_id: 'pronunciation',
      word_ids: weakCards.filter(c => c.ease < 1.5).map(c => c.vocab_id),
      error_count: weakCards.filter(c => c.ease < 1.5).reduce((sum, c) => sum + (c.errorCount || 1), 0),
      error_rate: weakCards.filter(c => c.ease < 1.5).length / Math.max(cards.length, 1),
      pattern_type: 'pronunciation' as const,
      suggested_review: weakCards.filter(c => c.ease < 1.5).map(c => c.kanji).slice(0, 5),
    },
    {
      cluster_id: 'meaning',
      word_ids: weakCards.filter(c => c.ease >= 1.5 && c.ease < 1.8).map(c => c.vocab_id),
      error_count: weakCards.filter(c => c.ease >= 1.5 && c.ease < 1.8).reduce((sum, c) => sum + (c.errorCount || 1), 0),
      error_rate: weakCards.filter(c => c.ease >= 1.5 && c.ease < 1.8).length / Math.max(cards.length, 1),
      pattern_type: 'meaning' as const,
      suggested_review: weakCards.filter(c => c.ease >= 1.5 && c.ease < 1.8).map(c => c.kanji).slice(0, 5),
    },
  ].filter(c => c.word_ids.length > 0);

  return clusters;
}

// Calculate adaptive difficulty recommendation based on accuracy history
export function calcAdaptiveDifficulty(
  accuracyHistory: number[],
  completedCount: number
): AdaptiveDifficulty {
  const recent = accuracyHistory.slice(-7);
  const avg7day = recent.length > 0
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : 0.5;

  let level: DifficultyLevel = 'beginner';
  if (avg7day >= 0.9 && completedCount >= 20) level = 'expert';
  else if (avg7day >= 0.8 && completedCount >= 10) level = 'advanced';
  else if (avg7day >= 0.7 && completedCount >= 5) level = 'intermediate';
  else if (avg7day >= 0.6) level = 'elementary';

  return {
    recommended_level: level,
    accuracy_7day: Math.round(avg7day * 100),
    weak_areas: avg7day < 0.7 ? ['vocabulary', 'particles'] : ['kanji'],
    strong_areas: avg7day >= 0.8 ? ['greetings', 'numbers'] : [],
    next_lesson_id: 'ja_u01_l01_hello_basic',
    confidence_score: Math.round(avg7day * 100),
  };
}

// ===== DUEL SCORING =====

export function calcDuelResult(
  challengerScore: number,
  opponentScore: number,
  xpStake: number
): { winnerId: 'challenger' | 'opponent' | 'draw'; xpDelta: number; message: string } {
  if (challengerScore > opponentScore) {
    return { winnerId: 'challenger', xpDelta: xpStake, message: '🏆 You won the duel!' };
  } else if (opponentScore > challengerScore) {
    return { winnerId: 'opponent', xpDelta: -xpStake, message: '😤 Challenger wins this round.' };
  }
  return { winnerId: 'draw', xpDelta: 0, message: '🤝 It\'s a draw!' };
}

// ===== BADGE UNLOCKING =====

// Check if any badges should be unlocked given current state
export function checkBadgeUnlocks(
  badges: Badge[],
  stats: {
    streak: number;
    totalXP: number;
    lessonsCompleted: number;
    friendCount: number;
    duelsWon: number;
    storiesCompleted: number;
  }
): Badge[] {
  return badges.map(badge => {
    if (badge.unlockedAt !== null) return badge; // already unlocked

    let shouldUnlock = false;
    if (badge.badge_id === 'b_streak_7' && stats.streak >= 7) shouldUnlock = true;
    if (badge.badge_id === 'b_streak_30' && stats.streak >= 30) shouldUnlock = true;
    if (badge.badge_id === 'b_streak_100' && stats.streak >= 100) shouldUnlock = true;
    if (badge.badge_id === 'b_xp_1000' && stats.totalXP >= 1000) shouldUnlock = true;
    if (badge.badge_id === 'b_xp_10000' && stats.totalXP >= 10000) shouldUnlock = true;
    if (badge.badge_id === 'b_lessons_10' && stats.lessonsCompleted >= 10) shouldUnlock = true;
    if (badge.badge_id === 'b_lessons_50' && stats.lessonsCompleted >= 50) shouldUnlock = true;
    if (badge.badge_id === 'b_social_friend' && stats.friendCount >= 1) shouldUnlock = true;
    if (badge.badge_id === 'b_duel_winner' && stats.duelsWon >= 1) shouldUnlock = true;
    if (badge.badge_id === 'b_story_reader' && stats.storiesCompleted >= 1) shouldUnlock = true;

    if (shouldUnlock) {
      return { ...badge, unlockedAt: new Date().toISOString() };
    }
    return badge;
  });
}

// Generate default badge catalog
export function generateDefaultBadges(): Badge[] {
  return [
    { badge_id: 'b_streak_7', title: 'Week Warrior', description: '7-day streak', icon: '🔥', rarity: 'common', unlockedAt: null, category: 'streak' },
    { badge_id: 'b_streak_30', title: 'Month Master', description: '30-day streak', icon: '🌟', rarity: 'rare', unlockedAt: null, category: 'streak' },
    { badge_id: 'b_streak_100', title: 'Centurion', description: '100-day streak', icon: '💯', rarity: 'epic', unlockedAt: null, category: 'streak' },
    { badge_id: 'b_xp_1000', title: 'XP Climber', description: 'Earn 1,000 XP', icon: '⚡', rarity: 'common', unlockedAt: null, category: 'learning' },
    { badge_id: 'b_xp_10000', title: 'XP Legend', description: 'Earn 10,000 XP', icon: '👑', rarity: 'legendary', unlockedAt: null, category: 'learning' },
    { badge_id: 'b_lessons_10', title: 'Dedicated Learner', description: 'Complete 10 lessons', icon: '📚', rarity: 'common', unlockedAt: null, category: 'learning' },
    { badge_id: 'b_lessons_50', title: 'Scholar', description: 'Complete 50 lessons', icon: '🎓', rarity: 'rare', unlockedAt: null, category: 'mastery' },
    { badge_id: 'b_social_friend', title: 'Social Learner', description: 'Add your first friend', icon: '🤝', rarity: 'common', unlockedAt: null, category: 'social' },
    { badge_id: 'b_duel_winner', title: 'Duel Champion', description: 'Win a duel', icon: '⚔️', rarity: 'rare', unlockedAt: null, category: 'social' },
    { badge_id: 'b_story_reader', title: 'Story Explorer', description: 'Complete a story', icon: '📖', rarity: 'common', unlockedAt: null, category: 'learning' },
    { badge_id: 'b_perfect', title: 'Perfectionist', description: 'Get 100% on a lesson', icon: '💎', rarity: 'epic', unlockedAt: null, category: 'mastery' },
    { badge_id: 'b_early', title: 'Early Bird', description: 'First to join EVLO', icon: '🌅', rarity: 'legendary', unlockedAt: new Date().toISOString(), category: 'special' },
  ];
}



// ===== XP LOGIC =====

export function calcXP(accuracy: number, timeSeconds: number): number {
  const speedBonus = timeSeconds < 90 ? 10 : 0;
  return Math.round(accuracy * 50) + speedBonus;
}

export function calcMasteryDelta(accuracy: number): number {
  return accuracy * 0.15;
}
export function calcXPForScore(correctCount: number, totalQuestions: number, timeSeconds: number): number {
  if (totalQuestions === 0) return 0;
  const accuracy = correctCount / totalQuestions;
  return calcXP(accuracy, timeSeconds);
}
