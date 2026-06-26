-- ================================================================
-- Learn with Velmorth — Subscription V2 Migration
-- Adds: ai_max plan, usage tracking, payment_history table
-- Run: 2026-06-26
-- ================================================================

-- ── 1. Extend entitlements plan_id & status CHECK constraints ────────────────
ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_plan_id_check;
ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_plan_id_check
  CHECK (plan_id IN ('free', 'starter', 'plus', 'pro', 'ai_max'));

ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_status_check;
ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_status_check
  CHECK (status IN ('free', 'starter', 'plus', 'pro', 'ai_max', 'yearly', 'cancelled'));

-- ── 2. Add usage-tracking columns to entitlements ────────────────────────────
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS ai_chats_used_today  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_chats_reset_at    DATE,
  ADD COLUMN IF NOT EXISTS billing_period       TEXT;  -- '7d' | '10d' | '15d' | '30d' | null

-- ── 3. Create payment_history table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id              TEXT NOT NULL,
  amount               INT  NOT NULL,   -- paise
  currency             TEXT NOT NULL DEFAULT 'INR',
  billing_period       TEXT,            -- '7d' | '10d' | '15d' | '30d'
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  status               TEXT NOT NULL DEFAULT 'success',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_user ON public.payment_history(user_id, created_at DESC);

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payment history"
  ON public.payment_history FOR SELECT
  USING (auth.uid() = user_id);

-- ── 4. Reset function: sets ai_chats_used_today = 0 for stale resets ────────
-- This is called from the app when a user loads the page after midnight.
-- A pg_cron job can also call this nightly if configured.
CREATE OR REPLACE FUNCTION reset_daily_ai_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.entitlements
  SET
    ai_chats_used_today = 0,
    ai_chats_reset_at   = CURRENT_DATE
  WHERE
    ai_chats_reset_at IS NULL
    OR ai_chats_reset_at < CURRENT_DATE;
END;
$$;

-- ── 5. RLS for service-role inserts into payment_history ─────────────────────
CREATE POLICY "Service role can insert payment history"
  ON public.payment_history FOR INSERT
  WITH CHECK (true);
