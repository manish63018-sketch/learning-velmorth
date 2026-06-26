# Learn with Velmorth v2 — Design System Specification

This document details the core design system tokens, typography scales, responsive layouts, and unified motion physics that drive the premium presentation layer of the platform.

---

## 1. Typography System

The platform uses two curated typefaces to maintain readability and aesthetic hierarchy:
* **Outfit (Google Font):** Used for large headings, dashboard greetings, XP counts, and brand displays.
* **Inter (Google Font):** Used for vocabulary definitions, grammar explanations, interface components, and body copy.

### Type Scale Hierarchy

| Token Name | Font Family | Size (rem / px) | Line Height | Usage |
| --- | --- | --- | --- | --- |
| `display-xl` | Outfit | `2.5rem` / `40px` | 1.1 | Splash screen, streak count display |
| `display-lg` | Outfit | `2.0rem` / `32px` | 1.2 | Heading levels, module completions |
| `title-lg` | Outfit | `1.5rem` / `24px` | 1.3 | Category header cards, dashboard greeting |
| `title-md` | Inter | `1.25rem` / `20px`| 1.4 | Lesson card questions, vocab display |
| `body-lg` | Inter | `1.1rem` / `17.6px`| 1.5 | Grammar explanation details, chat bubbles |
| `body-md` | Inter | `1.0rem` / `16px`  | 1.5 | Core layout labels, settings fields |
| `body-sm` | Inter | `0.85rem` / `13.6px`| 1.6 | Romaji subtext, badge unlock details |

---

## 2. Grid & Spacing System

Spacing matches a strict **4px/8px incremental base grid** to guarantee clean layouts across all client devices.

| Token | Value | Client Application Mapping |
| --- | --- | --- |
| `spacing-xs` | `4px` | Spacing between characters and furigana |
| `spacing-sm` | `8px` | Padding inside badge wrappers, layout borders |
| `spacing-md` | `16px` | Inner card padding, standard icon margins |
| `spacing-lg` | `24px` | Outer list grids, dashboard category gaps |
| `spacing-xl` | `32px` | Navigation menu side margins, splash logo margins |
| `spacing-xxl`| `48px` | Spacing between sections, hero title headers |

---

## 3. Premium Color System (HSL Token Matrix)

Themes override HSL variable sets dynamically on the `<html>` node. Light, Dark, and 8 Premium Themes define exact backgrounds, cards, borders, text, and active states.

### Core Themes

```css
/* Dark Mode (Default) */
:root[data-theme="dark"] {
  --background: 224 71% 4%;
  --card: 224 71% 7%;
  --border: 224 25% 15%;
  --text: 210 40% 98%;
  --text-muted: 215 20% 65%;
  --primary: 142 70% 45%;        /* Velmorth Leaf Green */
  --primary-hover: 142 70% 35%;
  --accent: 263 70% 50%;         /* Sakura Accent Pink */
}

/* Light Mode */
:root[data-theme="light"] {
  --background: 210 20% 98%;
  --card: 0 0% 100%;
  --border: 214 32% 91%;
  --text: 222 47% 11%;
  --text-muted: 215 16% 47%;
  --primary: 142 76% 36%;
  --primary-hover: 142 76% 28%;
  --accent: 262 80% 40%;
}
```

### Premium Themes (Unlockable Tiers)

* **1. Royal Purple (The Emperor's Theme)**
  * Background HSL: `270 50% 8%` | Card HSL: `270 50% 12%` | Border HSL: `270 20% 20%`
  * Text HSL: `270 10% 96%` | Primary HSL: `270 70% 50%` (Rich Amethyst)
* **2. Cobalt Blue (The Samurai's Theme)**
  * Background HSL: `220 60% 8%` | Card HSL: `220 60% 12%` | Border HSL: `220 20% 20%`
  * Text HSL: `220 10% 96%` | Primary HSL: `220 80% 50%` (High-energy Blue)
* **3. Sunset Red (The Tori Gate Theme)**
  * Background HSL: `0 50% 6%` | Card HSL: `0 50% 10%` | Border HSL: `0 20% 18%`
  * Text HSL: `0 10% 96%` | Primary HSL: `0 75% 50%` (Vibrant Vermilion)
* **4. Forest Green (The Kyoto Bamboo Theme)**
  * Background HSL: `150 40% 6%` | Card HSL: `150 40% 10%` | Border HSL: `150 20% 18%`
  * Text HSL: `150 10% 96%` | Primary HSL: `150 70% 45%` (Deep Jade)
* **5. Emerald Pink (The Blossom Theme)**
  * Background HSL: `330 50% 8%` | Card HSL: `330 50% 12%` | Border HSL: `330 20% 20%`
  * Text HSL: `330 10% 96%` | Primary HSL: `330 80% 60%` (Neon Rose)
* **6. Sakura Blossom (Warm Pastel)**
  * Background HSL: `340 30% 95%` | Card HSL: `0 0% 100%` | Border HSL: `340 40% 90%`
  * Text HSL: `340 20% 20%` | Primary HSL: `340 70% 65%` (Soft Pastel Cherry)
* **7. Night Shade (Extreme Contrast)**
  * Background HSL: `0 0% 0%` | Card HSL: `0 0% 4%` | Border HSL: `0 0% 12%`
  * Text HSL: `0 0% 100%` | Primary HSL: `0 0% 80%` (Monochrome Slate)
* **8. Cyber Neon (Tokyo Lights)**
  * Background HSL: `250 80% 3%` | Card HSL: `250 80% 6%` | Border HSL: `180 100% 50%` (Neon Cyan)
  * Text HSL: `300 100% 50%` (Magenta) | Primary HSL: `180 100% 50%`

---

## 4. Animation & Motion System

Interactive visual elements are driven by spring physics rather than linear delays.

### Framer Motion Constants

* **Spring - Quick Bounce (Buttons, tabs, quick clicks):**
  ```typescript
  export const SPRING_QUICK = {
    type: "spring",
    stiffness: 400,
    damping: 25,
    mass: 0.8
  };
  ```
* **Spring - Fluid Page (Page transitions, panel slides):**
  ```typescript
  export const SPRING_FLUID = {
    type: "spring",
    stiffness: 280,
    damping: 30,
    mass: 1.0
  };
  ```
* **Linear - Smooth Fade (Skeleton screens, overlay backdrop fades):**
  ```typescript
  export const FADE_SMOOTH = {
    type: "tween",
    ease: "easeInOut",
    duration: 0.25
  };
  ```

### Micro-interactions & Special Triggers

1. **Vocabulary Card Swipes:**
   * Uses Framer Motion's `drag="x"` constraints. Swiping past `150px` left/right triggers threshold transitions (Good/Hard) and updates local review scores with spring return animations.
2. **Tab Nav Hover Indicators:**
   * Bottom Navigation tabs render a layouts overlay behind the active icon using Framer Motion's `layoutId="activeTab"` for smooth translation jumps.
3. **Success Confetti Canvas:**
   * Quiz completion triggers a high-performance `<canvas>` overlay firing concentric confetti patterns computed via 2D physics math, preserving CPU usage.
4. **Interactive Skeleton Loader:**
   * Placeholders render pulsing gradients shifting from `var(--card)` to `var(--border)` dynamically using CSS-keyframes at 1.5s intervals.
