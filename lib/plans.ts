// ─────────────────────────────────────────────────────────────────────────────
// lib/plans.ts — Single source of truth for all subscription plan config
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'plus' | 'pro' | 'ai_max';
export type PlanStatus = 'free' | 'starter' | 'plus' | 'pro' | 'ai_max' | 'yearly' | 'cancelled';

export interface PlanConfig {
  id: PlanId;
  name: string;
  subtitle: string;
  price: number;              // INR
  pricePaise: number;         // for Razorpay (price * 100)
  periodLabel: string;        // display label e.g. "/ week"
  periodDays: number | null;  // null = forever (free)
  color: string;              // accent hex
  gradFrom: string;
  gradTo: string;
  emoji: string;
  popular: boolean;
  badge?: string;
  aiChatsPerDay: number;
  lessonsPerDay: number | null; // null = unlimited
  heartsMax: number;
  adsEnabled: boolean;
  features: string[];
  notIncluded: string[];
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    subtitle: 'Start your journey',
    price: 0,
    pricePaise: 0,
    periodLabel: 'forever',
    periodDays: null,
    color: '#9ca3af',
    gradFrom: '#1f2937',
    gradTo: '#111827',
    emoji: '🌱',
    popular: false,
    aiChatsPerDay: 5,
    lessonsPerDay: 5,
    heartsMax: 25,
    adsEnabled: true,
    features: [
      'JLPT N5 core lessons',
      '5 lessons per day',
      'Basic vocabulary & grammar',
      'Daily streak & XP system',
      'Progress tracking',
      'Community access',
      '5 AI chats/day',
    ],
    notIncluded: [
      'Writing practice',
      'Speaking practice',
      'Mock tests',
      'Advanced JLPT content',
    ],
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    subtitle: 'For serious beginners',
    price: 99,
    pricePaise: 9900,
    periodLabel: '/ week',
    periodDays: 7,
    color: '#60a5fa',
    gradFrom: '#1e3a5f',
    gradTo: '#172d4d',
    emoji: '⚡',
    popular: false,
    aiChatsPerDay: 15,
    lessonsPerDay: 15,
    heartsMax: 75,
    adsEnabled: false,
    features: [
      'No ads',
      'JLPT N5 full + N4 preview',
      '15 lessons per day',
      '15 AI chats per day',
      'Writing practice (basic)',
      'Speaking practice (basic)',
      'Smart daily review',
      'Weak word detection',
      'Progress sync',
    ],
    notIncluded: [
      'Full N4 content',
      'AI pronunciation scoring',
      'Mock tests',
    ],
  },

  plus: {
    id: 'plus',
    name: 'Plus',
    subtitle: 'Accelerate your learning',
    price: 149,
    pricePaise: 14900,
    periodLabel: '/ 10 days',
    periodDays: 10,
    color: '#a78bfa',
    gradFrom: '#3b1f6b',
    gradTo: '#2d1654',
    emoji: '⭐',
    popular: false,
    aiChatsPerDay: 40,
    lessonsPerDay: 30,
    heartsMax: 90,
    adsEnabled: false,
    features: [
      'Everything in Starter',
      'JLPT N5 + N4 full content',
      '30 lessons per day',
      '40 AI chats per day',
      'Full writing practice + AI correction',
      'Full speaking practice + pronunciation AI',
      'Mock tests',
      'Smart review engine',
      'AI study planner',
      'Faster support',
    ],
    notIncluded: [
      'N3–N1 content',
      'AI conversation partner',
      'Business / interview Japanese',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Full Japanese mastery',
    price: 249,
    pricePaise: 24900,
    periodLabel: '/ 15 days',
    periodDays: 15,
    color: '#f59e0b',
    gradFrom: '#5c3a0a',
    gradTo: '#3d2507',
    emoji: '👑',
    popular: false,
    badge: 'Best Value',
    aiChatsPerDay: 100,
    lessonsPerDay: null,
    heartsMax: 100,
    adsEnabled: false,
    features: [
      'JLPT N5→N1 all content',
      'Unlimited lessons',
      'No ads ever',
      '100 AI chats per day',
      'AI tutor + conversation partner',
      'AI grammar, vocabulary & sentence explainer',
      'AI translation & writing correction',
      'AI pronunciation analysis',
      'Writing stroke order + validation',
      'Speaking, interview & business Japanese',
      'Reading & listening practice',
      'Idioms, proverbs, counters',
      'Flashcards & bookmarks',
      'Smart revision & adaptive learning',
      'Unlimited mock tests',
      'Full analytics & achievement badges',
      'Priority sync & cloud backup',
      'Premium theme',
    ],
    notIncluded: [],
  },

  ai_max: {
    id: 'ai_max',
    name: 'AI Max',
    subtitle: 'For heavy AI users',
    price: 399,
    pricePaise: 39900,
    periodLabel: '/ month',
    periodDays: 30,
    color: '#e879f9',
    gradFrom: '#5b0f72',
    gradTo: '#3d0a4f',
    emoji: '🤖',
    popular: true,
    badge: 'Most Complete',
    aiChatsPerDay: 500,
    lessonsPerDay: null,
    heartsMax: 100,
    adsEnabled: false,
    features: [
      'Everything in Pro',
      '500 AI chats per day',
      'Priority AI responses',
      'Long AI conversations',
      'Advanced AI study planner',
      'Personalized learning roadmap',
      'AI-generated quizzes & practice exams',
      'AI interview simulator',
      'AI writing reviewer & speaking coach',
      'AI pronunciation coach',
      'AI homework helper',
      'AI flashcard generator',
      'AI learning analytics dashboard',
      'Beta features early access',
      'Priority support',
    ],
    notIncluded: [],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'plus', 'pro', 'ai_max'];

export function getPlanById(id: string | undefined | null): PlanConfig {
  return PLANS[(id as PlanId) || 'free'] || PLANS.free;
}

export function isPremiumPlan(planId: string | undefined | null): boolean {
  return ['starter', 'plus', 'pro', 'ai_max'].includes(planId || '');
}

/** Duration label for display */
export function getPeriodDays(planId: PlanId): number {
  return PLANS[planId].periodDays || 0;
}

/** Returns ends_at Date for a given plan starting now */
export function calcEndsAt(planId: PlanId): Date {
  const days = PLANS[planId].periodDays;
  const d = new Date();
  if (days) d.setDate(d.getDate() + days);
  return d;
}
