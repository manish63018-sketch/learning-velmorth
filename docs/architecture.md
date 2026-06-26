# Learn with Velmorth v2 — Master Architecture & Build Blueprint

> **Product Vision:** An AI-powered Japanese language learning SaaS platform that helps users progress from absolute beginner to JLPT N1, preparing them for real-world communication and careers in Japan.
> Runs as a responsive web app, PWA, Android APK (Capacitor), and desktop browser — from **one codebase, one backend, one database, one payment system.**

---

## System Architecture Overview

```
Clients
├── Next.js Web App (Browser)
├── PWA (Installable)
├── Android APK (Capacitor)
└── Admin Panel (/admin route group)

         │
         ▼

Shared Application Layer
├── Presentation Layer      ← UI, Design System, Motion, Accessibility
├── Feature Layer           ← All product features (Auth, Learn, AI, Premium...)
├── Domain Layer            ← Business Logic Engines
├── Data Layer              ← Supabase, Repositories, Cache, Edge Functions
└── Infrastructure Layer    ← Logging, Analytics, Flags, Monitoring

         │
         ▼

Supabase Backend
├── Auth (JWT)
├── PostgreSQL (RLS enabled)
├── Storage (Assets, Audio)
├── Realtime (Social/Duels)
└── Edge Functions (Secure scripts)

         │
         ▼

External Services
├── Google Gemini API     ← Sakura AI Engine
├── Razorpay              ← Payments
└── Vercel                ← Deployment
```

> **Golden Rule:** All AI requests go through a server-side Edge Function or server action — never called directly from the client. API keys, prompt engineering, rate limiting, and usage tracking all live server-side.

---

## Technology Stack

### Frontend
* **Framework:** Next.js 14.2.24 (App Router)
* **Language:** TypeScript
* **UI:** React 18.3.1
* **Styling:** Tailwind CSS (Custom Theme Palette)
* **Animations:** Framer Motion
* **Client State:** Zustand
* **Form Handling:** React Hook Form + Zod

### Backend & Database
* **Auth:** Supabase Auth (JWT & Session Cookies)
* **Database:** PostgreSQL (Supabase managed, fully relational)
* **Storage:** Supabase Storage buckets (Audio, Images, assets)
* **Edge Routing:** Server-side API Routes (`/app/api/*`)

### AI & Payments
* **AI Engine:** Google Gemini API (using `@google/generative-ai` securely server-side)
* **Payments:** Razorpay Gateway (signature verification on webhook triggers)

---

## Five-Layer Architecture

### Layer 1 — Presentation Layer
Responsible for layout formatting, accessibility, and user-facing interactive elements. All styling values are referenced using design tokens.
* **Theme Engine:** Manages dynamic theme state (`dark` | `light` | system default) and injects active CSS variables.
* **Motion System:** Framer Motion physics-based transitions, loading skeletons, and interactive hover states.

### Layer 2 — Feature Layer
Each feature lives as a modular layout or component group linked directly to route segments under `/app`.
* **Features:** Authentication, Dashboard, Learn Path, Vocab Flashcards, Kanji Canvas, Speak shadow modules, AI chat interface, Leaderboards, and Billing.

### Layer 3 — Domain Layer
Pure framework-agnostic business logic. These engines perform calculations without reading/writing databases directly.
* **XP Engine:** Calculates correct answers, completion speed, and repetition bonuses.
* **SRS Engine:** SM-2 spaced repetition interval and ease factor computations.
* **Streak Engine:** Validates day completion, streak maintenance, and Streak Freeze consumption.

### Layer 4 — Data Layer
Handles all reads, mutations, offline queue, and synchronization.
* **Repositories:** Access abstractions layer (e.g., `lessonRepository`, `progressRepository`).
* **API Endpoints:** Secure endpoint wrappers in `app/api/*` validating tokens and calling DB functions.

### Layer 5 — Infrastructure Layer
Runs silently for logs, events, error trapping, and analytics.
* **Logging:** Structured logging to `app_logs`.
* **Feature Flags:** Restricts or expands access dynamically based on role or subscription tier.

---

## Folder Structure

The project directory maps files directly under the root for streamlined imports and builds:

```
docs/                     ← Single source of truth system specifications
app/                      ← Next.js page routes, layouts, and API endpoints
├── api/                  ← Thin serverless API routes
├── context/              ← Shared contexts (AuthContext, StoreContext)
├── layout.tsx
└── page.tsx
components/               ← Reusable atom and layout components
hooks/                    ← Context listeners (useXP, useProgress, etc.)
lib/                      ← Supplying libraries (supabase, gemini client, plans)
services/                 ← Core logic calculations and mock generation
supabase/                 ← SQL Schema definition, seeds, and migrations
types/                    ← Shared TypeScript models and interfaces
utils/                    ← Analytics, validation schemas, and helpers
public/                   ← Vector assets, icons, manifest files
```

---

## Enterprise Expansion Modules

The system integrates 8 modular engines to provide robust, enterprise-grade capabilities:

### 1. Notification Engine
Orchestrates notification dispatching across multiple channels (Email, Push, In-App, and Capacitor Android Notifications) triggered by:
* **Reminders:** Daily learning targets, review queue due events, streak maintenance limits.
* **Social & AI:** Friend request approvals, achievement unlocks, subscriptions alerts, and custom Sakura AI encouragement prompts.

### 2. Search Engine
Performs lightning-fast global queries across Vocabulary, Grammar, Kanji, Lessons, Example Sentences, Community posts, and AI Chat history.
* Powered by **Postgres Full-Text Search (FTS)** and `pg_trgm` indexes for typo-tolerant searches.

### 3. Media Engine
A unified asset registry providing memory caching, resolution-aware scaling, and optimized loading pipelines for:
* **Audio files:** High-fidelity native speech audio.
* **Visuals:** SVG graphics, Lottie animation bundles, and custom typefaces.

### 4. Offline Engine
Enables learners to study seamlessly without network access by caching curriculum data:
* **IndexedDB / SQLite Storage:** Caches vocabulary cards, offline lessons, kanji stroke diagrams, and spoken audio files.
* **Capacitor Filesystem Bridge:** Persists downloaded media assets locally on mobile devices.

### 5. Sync Engine
Maintains eventual consistency between client states and the Supabase backend:
```
Offline Mode (Save)
      │
      ▼
Local DB Cache (Queue)
      │
      ▼
Online Detection (Internet)
      │
      ▼
Sync Queue Dispatcher
      │
      ▼
Supabase DB Sync (Conflict Resolution via Timestamps)
```

### 6. Theme Engine
Controls premium aesthetic configurations. Color systems are driven by custom HSL CSS variables, letting users unlock:
* **Core Themes:** Dark Mode, Light Mode, System Default.
* **Premium Themes:** Royal Purple, Cobalt Blue, Sunset Red, Forest Green, Emerald Pink, Sakura Blossom, Night Shade, and Cyber Neon.

### 7. Animation Engine
Standardizes interactive transitions and UI physics using Framer Motion:
* Outlines motion settings for Splash loaders, swipeable flashcards, floating action items, layout transitions, error tremors, loading skeletons, progress bars, and high-performance success confetti canvas overlays.

### 8. Content Engine
Extends standard curriculum parameters to support complex specialized contexts:
* Curriculum tracks map cleanly across Vocabulary, Grammar, Kanji, Reading, Listening, Speaking, Quizzes, Mock Exams, and vocabulary groups categorized by real-world topics (Interview prep, Business Japan, Travel phrases, Daily conversations, Anime terminology, Japanese news, and cultural etiquette).

---

## AI Sakura Core Architecture

Sakura is a unified orchestration engine that changes roles based on context:

```
                   ┌───────────────┐
                   │  Sakura Core  │
                   └───────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ Study Guide │   │ Lang Tutor  │   │ Conversation│
  │ (Progress)  │   │  (Lessons)  │   │  (Shadow)   │
  └─────────────┘   └─────────────┘   └─────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ▼
                 ┌──────────────────┐
                 │ Gemini API Gate  │
                 └──────────────────┘
```

* **Personalized study planner:** Generates custom roadmaps and tracks weak modules.
* **Language Coach:** Evaluates speaking pronunciation, reviews grammar, and gives interactive feedback.
* **Study Companion:** Serves as a warm, encouraging chat partner keeping users motivated.

---

## Key Workflows

### Complete Learning Flow
```
User Login
  → Dashboard Greeting & Goal Verification
  → Click "Continue Lesson" Card
  → Lesson Content (Vocab Cards → Grammar Tip → Kanji Canvas → Speaking Shadow → Writing correction)
  → Lesson Quiz
  → XP, Streak & Achievements Evaluator
  → Local Save & Eventual Sync (Sync Engine)
  → Next Module Unlock Checks
  → Claim Daily Leaf Rewards & View Leaderboard Updates
```

---

## Future Expansion & Scalability
The schema is built to scale beyond Japanese. Database tables support multi-language localizations dynamically:
```
Japanese (Default)
  → Korean Path (Dynamic seed update)
  → Chinese Path
  → French, Spanish, German, etc.
```
Adding a new language is a simple matter of inserting row data inside the `courses`, `modules`, and `lessons` tables. Code structures and business engines remain unchanged.
