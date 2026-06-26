export interface VocabItem {
  vocab_id: string;
  kanji: string;
  romaji: string;
  meaning_en: string;
  meaning_hi: string;
}

export interface Example {
  japanese: string;
  romaji: string;
  english: string;
  hindi: string;
}

export interface GrammarPoint {
  grammar_id: string;
  title: string;
  structure: string;
  explanation_en: string;
  explanation_hi?: string;
}

export interface PronunciationTip {
  tip_id: string;
  japanese: string;
  romaji: string;
  audio_ref?: string;
  tip_en: string;
  tip_hi?: string;
}

export interface Exercise {
  type: string; // 'translate' | 'tap' | 'fill' | 'match'
  prompt: string;
  correct_index?: number;
  options?: string[];
  correct_tap_order?: string[];
  options_tap?: string[];
}

export interface Lesson {
  lesson_id: string;
  lesson_title: string;
  difficulty: string;
  xp_reward: number;
  is_premium?: boolean;
  vocabulary: VocabItem[];
  grammar_point: GrammarPoint;
  pronunciation_tip?: PronunciationTip;
  examples: Example[];
  review_words: string[];
}

export interface Unit {
  unit_id: string;
  unit_title: string;
  unit_icon?: string;
  lessons: Lesson[];
}

export interface UserProgress {
  uid: string;
  lessonId: string;
  score: number;
  completed: boolean;
  completedAt: string;
}

export interface UserState {
  uid: string;
  name: string;
  username: string;
  email: string;
  profileImage?: string;
  xp: number;
  level: number;
  streak: number;
  leafBalance: number;
  isPremium: boolean;
  darkMode: boolean;
  createdAt: string;
  lastActive: string;
}

export interface SRSCard {
  cardId: string; // vocabId
  vocab_id: string;
  kanji: string;
  romaji: string;
  meaning_en: string;
  meaning_hi: string;
  interval: number; // in days
  ease: number; // ease factor
  repetitions: number;
  dueDate: string; // ISO string
}

// Monorepo Blueprint additions
export interface UserProfile {
  displayName: string;
  photoURL?: string;
  targetLanguage: string;
  nativeLanguage: string;
  goalMinutes: number;
  role: "learner" | "creator" | "moderator" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface Progress {
  mastery: number;
  xp: number;
  accuracy: number;
  lastReviewedAt: string;
  updatedAt: string;
}

export interface ScoreRequest {
  total_questions: number;
  correct_answers: number;
  time_seconds: number;
}

// ===== GAMIFICATION =====

export type QuestType = 'daily' | 'weekly' | 'special';
export type QuestStatus = 'active' | 'completed' | 'claimed';

export interface Quest {
  quest_id: string;
  title: string;
  description: string;
  type: QuestType;
  xp_reward: number;
  gem_reward: number;
  icon: string;
  target: number;
  progress: number;
  status: QuestStatus;
  expiresAt: string;
}

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  badge_id: string;
  title: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  unlockedAt: string | null;
  category: 'learning' | 'streak' | 'social' | 'mastery' | 'special';
}

export interface StreakShield {
  active: boolean;
  uses_remaining: number;
  max_uses: number;
  activatedAt: string | null;
}

export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'obsidian';

export interface LeagueEntry {
  userId: string;
  username: string;
  avatar: string;
  weeklyXP: number;
  tier: LeagueTier;
  rank: number;
  isYou: boolean;
  promoted?: boolean;
  demoted?: boolean;
}

export interface SeasonInfo {
  season_id: string;
  season_name: string;
  ends_at: string;
  current_tier: LeagueTier;
  weekly_xp: number;
  promotion_threshold: number;
  demotion_threshold: number;
}

// ===== SOCIAL =====

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export interface Friend {
  friend_id: string;
  username: string;
  avatar: string;
  xp: number;
  streak: number;
  status: FriendStatus;
  lastActive: string;
  nudged_today: boolean;
}

export type DuelStatus = 'pending' | 'active' | 'completed' | 'expired';

export interface Duel {
  duel_id: string;
  challenger_id: string;
  challenger_name: string;
  challenger_avatar: string;
  opponent_id: string;
  opponent_name: string;
  opponent_avatar: string;
  lesson_id: string;
  challenger_score: number | null;
  opponent_score: number | null;
  status: DuelStatus;
  winner_id: string | null;
  xp_stake: number;
  createdAt: string;
  expiresAt: string;
}

export interface StudyCircle {
  circle_id: string;
  name: string;
  description: string;
  avatar: string;
  member_count: number;
  weekly_xp: number;
  current_mission: string;
  mission_progress: number;
  mission_target: number;
  is_member: boolean;
}

// ===== INTELLIGENCE =====

export type DifficultyLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'expert';

export interface AdaptiveDifficulty {
  recommended_level: DifficultyLevel;
  accuracy_7day: number;
  weak_areas: string[];
  strong_areas: string[];
  next_lesson_id: string;
  confidence_score: number;
}

export interface MistakeCluster {
  cluster_id: string;
  word_ids: string[];
  error_count: number;
  error_rate: number;
  pattern_type: 'pronunciation' | 'meaning' | 'kanji' | 'grammar';
  suggested_review: string[];
}

// ===== STORIES =====

export type StoryDifficulty = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface StoryDialogueLine {
  speaker: string;
  avatar: string;
  japanese: string;
  romaji: string;
  english: string;
  hindi?: string;
  audio_key?: string;
}

export interface StoryChoice {
  choice_id: string;
  text_en: string;
  text_ja: string;
  next_scene_id: string;
  xp_bonus: number;
  is_correct: boolean;
}

export interface StoryScene {
  scene_id: string;
  background: string;
  dialogue: StoryDialogueLine[];
  choices?: StoryChoice[];
  is_end?: boolean;
}

export interface Story {
  story_id: string;
  title: string;
  description: string;
  thumbnail: string;
  difficulty: StoryDifficulty;
  estimated_minutes: number;
  xp_reward: number;
  scenes: StoryScene[];
  tags: string[];
  is_locked: boolean;
  completed: boolean;
  completedAt: string | null;
}

// ===== AI CONVERSATION =====

export type ChatRole = 'user' | 'ai' | 'system';

export interface ChatMessage {
  message_id: string;
  role: ChatRole;
  content_ja: string;
  content_romaji: string;
  content_en: string;
  timestamp: string;
  score?: number;
  hint?: string;
}

export interface ConversationSession {
  session_id: string;
  topic: string;
  difficulty: DifficultyLevel;
  messages: ChatMessage[];
  xp_earned: number;
  startedAt: string;
}
