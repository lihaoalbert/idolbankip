# Design System: ibi.ren — Studio Tech Console
## R12 visual baseline (supersedes R8 art-gallery / publishing style)

---

## 1. Visual Theme & Atmosphere

Restrained, technical, workflow-first — like the inside of **Linear**, **Resend**, or **Cal.com**. The platform reads as a **serious tool**, not a gallery.

- **Density:** 6 / 10. Dense enough to surface 6–8 IPs per row on browse; light enough that detail pages breathe.
- **Variance:** 4 / 10. Asymmetric in hero / detail pages; symmetric in tool surfaces (workspace, orders, briefs).
- **Motion:** 4 / 10. Micro-interactions only — no cinematic choreography. 150ms hover, 200ms page transitions, springs reserved for modals.
- **Atmosphere adjectives:** sharp, calm, legible, technical, instrumented.

The mood: a buyer opens `/ips` and immediately knows what to do — filter, license, message a creator. A creator opens `/creator/dashboard` and feels the platform tracks every brief/contract/order for them. **No decorative chrome does that work for them.**

**Contrast with R8:** R8 was "美术馆 + 出版物" — soft, decorative, type-as-art. R12 is **information-first**: type does the work, not decoration. Hairline 1px borders replace mood-setting; cobalt accent replaces brand-color blocks; dense metadata replaces curated breathing room.

---

## 2. Color Palette & Roles

| Name | Hex | Role |
|---|---|---|
| **Canvas** | `#FAFAFA` (Zinc-50) | Page background. Slight warmth, never pure white at the page layer |
| **Surface** | `#FFFFFF` | Cards, panels, modal backgrounds |
| **Surface Hover** | `#F4F4F5` (Zinc-100) | Subtle hover for buttons / rows |
| **Ink Primary** | `#09090B` (Zinc-950) | Headings, body text. **Never `#000000`** |
| **Ink Secondary** | `#52525B` (Zinc-600) | Descriptions, helper text, sub-labels |
| **Ink Tertiary** | `#A1A1AA` (Zinc-400) | Metadata, timestamps, captions, disabled |
| **Border Default** | `#E4E4E7` (Zinc-200) | 1px structural dividers, card edges |
| **Border Strong** | `#D4D4D8` (Zinc-300) | Hover state on borders, table headers |
| **Border Subtle** | `rgba(228, 228, 231, 0.6)` | Inside-card sections, dividers under sections |
| **Signal Cobalt** | `#2563EB` (Cobalt-600) | **Single accent**: primary CTA, active state, focus ring, "Verified" pill |
| **Signal Cobalt Hover** | `#1D4ED8` (Cobalt-700) | CTA pressed/hover |
| **Signal Cobalt Soft** | `#DBEAFE` (Cobalt-100) | Tag backgrounds, selected row tint |
| **Success** | `#16A34A` (Green-600) | Success indicators, KYC verified chip |
| **Warning** | `#D97706` (Amber-600) | Pending state, brief awaiting action |
| **Danger** | `#DC2626` (Red-600) | Errors, destructive actions, KYC rejected |

**Hard rules:**
- Max one accent (Cobalt). Every other "color" is a *status* (success/warning/danger), not a brand play.
- No purple/violet gradient buttons. No neon outer shadows. No warm/cool drift — one neutral family (Zinc).
- Primary CTA is **flat fill only**. No glow, no gradient, no "shine sweep".
- Background is never pure white at the page layer — `#FAFAFA` creates separation between canvas and surface.

---

## 3. Typography Rules

**Font stack (via `@fontsource` for offline loading):**
- **Display + Body:** `Geist` (sans). Linear-grade neutrality, slightly narrower than Inter.
- **Mono:** `Geist Mono`. IDs, prices, timestamps, dates, code, file paths.
- **Banned:** `Inter` (signature AI SaaS tell — every AI-built project uses it), `Times` / `Georgia` / generic serif.

**Type scale (size / line-height / weight / tracking):**

| Role | Spec | Usage |
|---|---|---|
| Display | 48 / 1.05 / 600 / -0.03em | Hero titles, page H1 on detail pages |
| H1 | 32 / 1.15 / 600 / -0.02em | Section opener, page titles |
| H2 | 24 / 1.25 / 600 / -0.01em | Card / panel titles |
| H3 | 20 / 1.30 / 500 / 0 | Subsections, list headers |
| Body | 15 / 1.60 / 400 / 0 | Default body text |
| Body Strong | 15 / 1.60 / 500 / 0 | emphasized inline |
| Caption | 13 / 1.45 / 400 / 0 | helper text, descriptions |
| Micro | 12 / 1.30 / 500 / +0.04em / UPPERCASE | tag labels, status pills |
| Mono Body | 13 / 1.50 / 400 | IDs, codes, file paths |
| Mono Numeric | 14 / 1.40 / 500 | prices (tabular figures), counts |

**Hard rules:**
- Body text max width: **65ch** (~580px at 15px).
- All numeric values: `font-feature-settings: "tnum"` (tabular figures, aligns columns).
- Headings carry hierarchy through **weight + size**, never decorative rules or color alone.
- Dates always ISO (`2026-07-14`), never `Today` / `Yesterday`.
- Status text: sentence case (`Verified`, not `VERIFIED`). `Micro` UPPERCASE only for system tags.
- Tabular numerics mandatory for any number that lives in a table column or row.

---

## 4. ibiren Component Stylings

### Buttons
- **Primary:** Cobalt-600 fill, white text, flat (no shadow, no glow). 8px radius. Hover → Cobalt-700. Active → -1px Y translate + Cobalt-700. Sizes: sm 32 / md 40 / lg 44.
- **Secondary:** White fill, Ink Primary text, 1px Zinc-200 border. Hover → Zinc-100 fill + Zinc-300 border.
- **Ghost:** Transparent, Ink Secondary text. Hover → Zinc-100 fill.
- **Destructive:** Red-600 fill (rare — only delete-account, cancel-order).
- **Icon-only:** 36px square, Zinc-100 bg, Ink Secondary icon, no border.
- **Banned:** gradient CTAs, outer glow, "shine sweep" on hover, custom mouse cursors.

### Cards
- White surface, 1px Zinc-200 border, **8px radius**. NO shadow by default.
- Internal padding 16px (compact) / 20px (regular) / 24px (hero card).
- Hover: border → Zinc-300, 150ms ease-out. No shadow changes.
- Dense list views (orders, briefs, IPs): use **border-top divider rows** instead of cards. 56–72px row height.

### Inputs
- Label above (8px gap), input height 40px, padding 12px L/R.
- Border: 1px Zinc-200. Background: White. Placeholder: Ink Tertiary.
- Hover: border → Zinc-300. Focus: 2px Cobalt-600 ring with 1px Zinc-200 base, Ink-Primary text.
- Helper text below, Ink Secondary 13px. Error: text turns Red-600 + 2px Red-200 ring at the top.
- **Banned:** floating labels, animated placeholder shifts, full-width outlines.

### Pills / Tags
- 24px height, padding 0 8px, 4px corner radius.
- Default: Zinc-100 bg + Zinc-700 text.
- Cobalt variant (for "Verified", "Featured"): Cobalt-100 bg + Cobalt-700 text.
- Pill + dot: 6px dot (status color) with 2px outer halo (same color at 25% alpha).

### Avatars
- 40px default / 32px (sm) / 48px (md). Circle. Zinc-100 default fill with Geist Mono initials (`MS`, `WY`).
- With image: 1px Zinc-200 border. No halo glow.

### Lists / Tables
- Table header: Zinc-50 fill (subtle elevation), 13px Micro UPPERCASE Ink Secondary, 1px border-bottom Zinc-200.
- Rows: 64px default, hover → Zinc-50 fill, 1px border-top Zinc-200 between rows.
- Numbers right-aligned, mono font with tabular-nums.
- Status column: dot + small text label, transparent cell background.

### Loading / Empty / Error States
- **Loading:** skeleton blocks matching exact content dimensions, Zinc-200 base + 1.5s shimmer (linear-gradient slide). No spinners.
- **Empty:** centered composition with small SVG illustration (Zinc-400 stroke, no fill) + 1-line description + 1 CTA below.
- **Error:** inline Red-600 text + 4px Red-600 top border. No full-screen overlay unless 500-class.

---

## 5. Layout Principles

### Grid & Max-Width
- **Content max-width:** 1280px (larger than museum's 980px to fit 4-card IP grids).
- **Hero full-bleed:** allowed on detail pages, max 1440px image with 24px side gutter.
- **12-column grid**, 24px gutter desktop / 16px tablet / 0 mobile.
- **Dashboard split:** 240px fixed sidebar + flex content. Collapsible to 64px icon-rail on tablet. Hidden with hamburger drawer on mobile.

### Spacing Scale
- Base 4px. Allowed: **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96**.
- Vertical section gap: 48px desktop / 32px mobile.
- Within cards: 16-20px padding. Card-to-card gap: 16px grid gap.
- Form field vertical rhythm: 24px between fields, 8px label-to-input.

### Asymmetric Hero (variance > 4)
- **IP detail hero:** 7/12 image + 5/12 metadata column (image dominant on the left).
- **Home hero:** 5/8 left text + 3/8 right product preview (text dominant on the left).
- **Dashboard hero:** none — instead, 4-stat-card strip (280px wide × 1, 24px gap).

### Banned Layouts
- 3-equal-column hero feature blocks. Use 2/3 + 1/3 asymmetric instead.
- Centered vertical stacks with full-width content (use max-width + left-aligned).
- H-screen hero (iOS Safari catastrophic jump): always `min-h-[100dvh]`.

---

## 6. Motion & Interaction

### Easing
- **Default (color/opacity):** `cubic-bezier(0.22, 1, 0.36, 1)` smooth-out. Never linear.
- **Modals / Drawers / Popovers:** spring `stiffness: 200, damping: 26` (short, decisive).

### Hover / Press
- Color transitions: 150ms ease-out.
- Button press: -1px Y translate + bg darken, 80ms.

### Page Transitions
- Route change: opacity 0→1 + 8px translate-Y 0→-8 over 200ms ease-out.
- List mount stagger (max 6 items): 30ms between items, 200ms per item ease-out.

### Skeletal Loaders
- Match exact content dimensions. Linear-gradient: `linear-gradient(90deg, #F4F4F5 0%, #FAFAFA 50%, #F4F4F5 100%)` over 1.5s infinite.
- **No spinners. No circular progress.**

### Required Micro-Interactions
- "Verified" dot on creator cards: 1px outer halo pulse, 3s loop (subtle, low opacity).
- Status dot on order rows: 6px dot + 8px halo; halo slow pulse while "pending".
- Form submit: button text → 3-char "..." rail animation, 600ms.
- Toast: slide from top-right, 200ms ease-out; auto-dismiss 4s; reverse on close.

### Performance Constraints
- Animate only `transform` and `opacity`. Never `top`, `left`, `width`, `height`.
- Grain/noise overlays: only on `position: fixed` pseudo-elements (`pointer-events: none`).
- Code-level: use `will-change: transform, opacity` sparingly; remove after animation ends.

---

## 7. Anti-Patterns (Banned)

### Typography
- `Inter` font (signature AI SaaS tell — every AI-built project uses it).
- Generic serifs (`Times`, `Georgia`, `Garamond`, `Palatino`).
- Gradient text on headings ("Linear-style gradient" is itself a cliché).
- Hero display type larger than 48px (looks desperate).

### Color
- Pure `#000000` or `#FFFFFF` as primary.
- Neon/violet/purple button glow.
- Multi-accent palette (green-CTA + red-error + orange-warning + blue-link). One accent only.
- Gradient fills on buttons or cards.

### Components
- Shadow-based elevation without border (cards must be border-defined, never both).
- Floating-label inputs.
- Circular/spinner loaders.
- "Shine sweep" hover effect on buttons.
- Custom mouse cursors.
- 3-column equal feature card grids.

### Layout
- Centered vertical hero stacks on variance-4+ projects.
- Overlapping elements (text over image over button). No.
- `h-screen` (use `min-h-[100dvh]` for iOS Safari).
- `calc(100% - 200px)`-style flex math — use grid.
- Horizontal scroll on mobile.
- Touch targets < 44px.

### Copy
- AI marketing clichés: "elevate", "seamless", "unleash", "next-gen", "transform your workflow".
- Filler UI: "Scroll to explore", "Swipe down", bouncing chevrons, scroll arrows.
- Round-number pricing: `¥99.99`, `50% off`, `100% verified`.
- Vague creator names: "Creator A", "Brand X". Use real-feeling names: "Mei Studio", "Wen Yu", "Lin Frame".
- "Lorem ipsum" or visible placeholder text in production.

### Data
- Broken image links. Use `picsum.photos/seed/<id>/<size>` with stable seed.
- Fake stats: "10M+ creators" without basis.
- Vague metrics: "successful deals", "verified" without number.

### Motion
- Bouncy easing (`back-out`, elastic).
- Spinner loaders.
- Animated gradient backgrounds.
- Loops longer than 3s (skeleton shimmer max 1.5s).
- Layout animations (animating `width`/`height` on resize).

---

## 8. ibiren Page Applications

R12 doesn't treat every page the same. Here is which mode each surface uses:

| Surface | Mode | Notes |
|---|---|---|
| `/` (landing) | Asymmetric hero | 5/8 text + 3/8 preview card. Single Cobalt CTA. No "scroll to explore" |
| `/ips` (browse) | Dense grid | 4 cards/row desktop, hairline borders, mono prices. Filter rail left 240px |
| `/ips/:id` (IP detail) | Asymmetric hero | 7/12 image + 5/12 metadata. Single primary action row. Recent works grid below |
| `/buyer/chat` | Three-pane console | Left: brief list. Center: message stream. Right: insight pane. 12–16px gaps max |
| `/buyer/briefs` | Dense list rows | Border-top rows, 64px height. Mono budget/date. Right-aligned status pill |
| `/buyer/orders` | Compact table | Table headers, mono prices right-aligned. Status column: dot + label |
| `/buyer/dashboard` | Stat strip | 4 stat cards 280px wide × 1, then activity stream |
| `/creator/dashboard` | Stat strip + feed | Same 4-stat strip, then briefs/messages feed |
| `/creator/ips` | Manager grid | Same as `/ips` + inline Edit/Duplicate owner controls |
| `/creator/settings` | Form sections | Label-above inputs, 24px rhythm, no card stack |
| `/login`, `/signup` | Centered minimal | 400px-wide form, no marketing copy. Direct entry. |
| KYC flow | Step console | Left step nav (1/3 Done, 2/3 Active, 3/3 Pending). Right form panel. |

---

## 9. Migration from R8 (museum → console)

Apply R12 to existing screens one surface at a time. Start with **IP detail and `/ips` browse** (highest visibility).

| R8 (museum) | R12 (console) | Notes |
|---|---|---|
| `rounded-2xl` (16px) cards | `rounded-lg` (8px) corners | Tighter visual rhythm |
| 24-32px internal card padding | 16-20px padding | More density |
| Decorative rules under headings | Functional `border-bottom` only | Removes noise |
| Brand color blocks (`brand-primary`) | Cobalt-600 restricted to CTAs | Accent single purpose |
| @fontsource editorial serif | @fontsource Geist + Geist Mono | Sans-only |
| Status as colored background | Status as dot + text, transparent bg | Less surface noise |
| Multi-line poetic descriptions | Single-sentence 65ch description | Less poetry, more action |
| Soft shadow cards | 1px border cards, no shadow | More honest elevation |

**Migration order:** `/ips` → `/ips/:id` → `/buyer/*` → `/creator/*`. Verify E2E on each surface before next.

---

## 10. Quick Recipe (for Stitch prompts)

When generating new screens in Stitch, frame the prompt as:

> Studio Tech console — off-white (`#FAFAFA`) canvas, white surfaces, 1px `#E4E4E7` borders, no shadows, single `#2563EB` cobalt accent used sparingly. Geist + Geist Mono typography. 8px corner radius. Linear/Resend-grade density. No purple glow, no gradient CTAs, no emojis, no `rounded-2xl` decorative cards. Numeric values in mono. ISO dates. Asymmetric hero (5/8 + 3/8 split).

This is the **single-source-of-truth** prompt prefix. Any new screen generated from Stitch should start with this and append the screen-specific description.

---

*Last updated: 2026-07-14 — R12 visual baseline. Replaces R8 (`project_r8_visual_baseline`).*
