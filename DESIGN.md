---
name: Bolão da Copa 2026
description: Mobile-first prediction-pool app — a trustworthy scoreboard among friends for the FIFA World Cup 2026.
colors:
  pitch-green: "#06AA48"
  background: "#FFFFFF"
  surface-soft: "#FAFAFA"
  surface-section: "#F3F3F3"
  border: "#CCCCCC"
  ink: "#111111"
  ink-strong: "#333333"
  ink-muted: "#666666"
  ink-subtle: "#999999"
  danger: "#CC0000"
  whatsapp: "#25D366"
typography:
  display:
    fontFamily: "Open Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Open Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Open Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Open Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.pitch-green}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-section}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "#ECECEC"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Bolão da Copa 2026

## 1. Overview

**Creative North Star: "The Matchday Scoreboard"**

This is the visual system of a clean digital scoreboard, not a sports portal and not a betting app. Scores, names, deadlines, and ranking position are the content; everything else gets out of the way. The reader is a friend on a phone, often outdoors around a match, who wants to enter a prediction in seconds and trust that the numbers are fair. Every screen is a single column of legible information with one obvious primary action.

The palette is white-paper backgrounds, near-black ink, hairline gray borders, and exactly one committed accent: Pitch Green. Depth is carried by borders and tonal grays, never by drop shadows. Type is a single workhorse sans (Open Sans) doing all the jobs through weight and scale. The result reads as plain and dependable: the design equivalent of a referee's clipboard, not a casino floor.

This system explicitly rejects two things. It is **not a gambling or betting site** — no odds, neon, dark-pattern urgency, or money-pushing chrome; the app records and calculates but never operates money, and the visuals must never imply otherwise. And it is **not a corporate SaaS dashboard** — no KPI tiles, chart soup, lifted card grids, or enterprise gray; the admin screen is one friend running a group, not an operations console.

**Key Characteristics:**
- One column, mobile-first, one primary action per screen.
- A single committed accent (Pitch Green) on a white-and-gray field.
- Flat by default: borders and tonal layering, not shadows.
- One type family (Open Sans); hierarchy from weight and scale.
- Numbers, deadlines, and money states read instantly and unambiguously.
- Portuguese (pt-BR); dates in America/São_Paulo, currency in BRL.

## 2. Colors

A near-monochrome white-and-ink field with one committed green accent and a small set of functional signal colors.

### Primary
- **Pitch Green** (`#06AA48`): the single committed accent. Primary buttons ("Entrar com link mágico", "Confirmar palpite", "Confirmar pagamento"), text links, the focused input border, the "palpite feito" state, and the leader row highlight (used at ~10% opacity, `bg-accent/10`). It means *go / done / confirmed*. It is the only saturated hue on most screens, and that rarity is what makes it read as action.

### Neutral
- **Ink** (`#111111`): default body and heading text on white. The page default set on `<body>`.
- **Ink Strong** (`#333333`): the workhorse for emphasized secondary text and dense UI labels (the most-used ink after the body default).
- **Ink Muted** (`#666666`): table headers, secondary captions, low-emphasis labels. The floor for *small* text on white that still meets AA (~5.7:1).
- **Ink Subtle** (`#999999`): the most muted ink, for the quietest metadata only. Below this, contrast on white fails AA.
- **Background** (`#FFFFFF`): the default page and card surface.
- **Surface Soft** (`#FAFAFA`): barely-there section tint for grouping.
- **Surface Section** (`#F3F3F3`): the secondary-button fill and stronger section separation; also the divider tint between ranking rows.
- **Border** (`#CCCCCC`): the universal hairline — card outlines, input strokes, table header rule, avatar fallback fill. This is how the flat system gets its structure.

### Tertiary (signal colors)
- **Danger Red** (`#CC0000`): destructive and error states (cancel result, validation errors). Canonical danger red.
- **WhatsApp Green** (`#25D366`): reserved exclusively for the "share on WhatsApp" affordance. It is a brand-utility color, never a general accent — keep it off everything that isn't the WhatsApp share.

### Named Rules
**The One Green Rule.** Pitch Green is the only saturated accent in the product. If a second saturated hue appears next to it that isn't a signal color (danger, WhatsApp), one of them is wrong. Emphasis that isn't an action comes from weight and scale, not from a new color.

**The Single Danger Rule.** There is exactly one danger red: `#CC0000`. The legacy `#B00020` that appears in a few places is a drift, not a second token — consolidate on `#CC0000`. Never carry two reds.

**The #888 Floor Rule.** Muted body text stops at `#666666` on white (~5.7:1). `#888888` (~3.5:1) and lighter fail WCAG AA for body text — never use them for text a user must read, only for non-essential decoration. The current "palpite pendente" / "travado" status text in `#888888` is a known violation to fix.

## 3. Typography

**Display Font:** Open Sans (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Body Font:** Open Sans (same family)
**Label/Mono Font:** none — one family does every job.

**Character:** Open Sans is a neutral, highly legible humanist sans — the right call for a scoreboard read at a glance on a phone in sunlight. There is no display/body pairing; all hierarchy comes from weight (400 / 600 / 700) and scale. One family, no decoration, no second voice.

### Hierarchy
- **Display** (700, 1.5rem / `text-2xl`, line-height 1.2): page titles — "Próximos jogos", "Bolão da Copa 2026". The top of every screen. No clamp; the app never shouts.
- **Title** (600, 1rem, line-height 1.3): in-row and in-card emphasis — match team names, the leader row. `font-semibold` on otherwise body-sized text.
- **Body** (400, 1rem, line-height 1.5): default reading text. Keep prose blocks ≤ 65–75ch (rarely an issue in a single mobile column).
- **Label** (500, 0.875rem / `text-sm`, line-height 1.4): form labels, button text, status lines, secondary captions. The most common UI size after body. (Buttons render this at weight 600.)
- **Micro** (400–700, 0.75rem / `text-xs`): table cell density and the avatar initial only. Not for sentences.

### Named Rules
**The One Family Rule.** Open Sans does everything. Do not introduce a display serif, a second sans, or a mono. Three fonts read as indecision; this product earns its calm from one well-set family.

**The No All-Caps Body Rule.** Uppercase is reserved for nothing here by default — labels are sentence case in Portuguese. No tracked all-caps eyebrows above sections.

## 4. Elevation

Flat by default. The system conveys depth through `#CCCCCC` hairline borders and tonal gray surfaces (`#FFFFFF` → `#FAFAFA` → `#F3F3F3`), not through shadows. The codebase contains a single `shadow-sm` in its entirety, and that is the correct posture: a scoreboard is a flat surface.

### Shadow Vocabulary (if applicable)
- **Overlay shadow** (`box-shadow: 0 4px 16px rgba(0,0,0,0.12)`): the *only* sanctioned shadow, and only for things that genuinely float over the page — a dialog, a popover, a sticky bar. Never on resting cards or list items.

### Named Rules
**The Flat-Scoreboard Rule.** Surfaces are flat at rest. A card, a match row, and a ranking row all sit on the page with a border, never a shadow. Shadow appears only when an element leaves the page plane (modal, popover). If a card has a resting drop shadow, it has drifted toward the SaaS-dashboard look this system rejects.

## 5. Components

### Buttons
- **Shape:** gently rounded (6px, `rounded-md`).
- **Primary:** Pitch Green fill, white text, padding `8px 16px` (`px-4 py-2`), `text-sm` weight 600. Hover dims via `filter: brightness(0.95)`; `transition: background-color`. Disabled: `opacity: 0.5; cursor: not-allowed`.
- **Secondary:** `#F3F3F3` fill, Ink text, `#CCCCCC` border, same shape and padding. Hover fill `#ECECEC`.
- **Focus:** must show a visible focus ring (currently relies on UA default — strengthen to a Pitch-Green ring for AA keyboard support).

### Cards / Containers
- **Corner Style:** 6px (`rounded-md`).
- **Background:** white (`#FFFFFF`); group with `#FAFAFA` / `#F3F3F3` tints when needed.
- **Shadow Strategy:** none — see Elevation. Structure comes from a `#CCCCCC` border.
- **Border:** 1px `#CCCCCC`.
- **Internal Padding:** 16px (`p-4`); stacked content gaps of 8–12px.

### Inputs / Fields
- **Style:** white fill, 1px `#CCCCCC` border, 6px radius, padding `8px 12px` (`px-3 py-2`), `text-base` (16px — large enough to prevent iOS zoom-on-focus).
- **Focus:** border shifts to Pitch Green (`focus:border-accent`), `outline: none`. Add a matching focus ring for keyboard visibility.
- **Label:** Label role (`text-sm`, weight 500), stacked above the field.

### Tables (Ranking)
- **Structure:** full-width, `border-collapse`, left-aligned; numeric columns (Pontos, Cravadas) right-aligned.
- **Header:** `text-sm` Ink Muted (`#666666`), bottom rule `#CCCCCC`.
- **Rows:** divided by `#F3F3F3` bottom borders.
- **Leader row:** highlighted with `bg-accent/10` (Pitch Green at 10%) and weight 700 — the one place ranking position earns color. Carry a non-color cue too (position "1", bold) so the highlight isn't color-only.

### Avatar
- **Shape:** 28px circle (`rounded-full`).
- **Fallback:** when no image, a `#CCCCCC` fill with the name's initial in `#222222`, `text-xs` bold; `aria-hidden` (the adjacent name is the accessible label).

### Flag
- **Behavior:** renders the crest image when a `bandeira` URL exists; otherwise a regional-indicator emoji from the 2-letter country code; otherwise the raw code. Always paired with the country name as text — never flag-only.

### Share (WhatsApp)
- **Style:** uses WhatsApp Green (`#25D366`) exclusively. This is the single exception to The One Green Rule, justified by platform recognition. A "copy link" companion stays neutral.

## 6. Do's and Don'ts

### Do:
- **Do** keep one committed accent: Pitch Green (`#06AA48`) for actions, links, "done", and the leader highlight. Everything else is white, ink, and `#CCCCCC` borders.
- **Do** convey depth with borders and tonal grays. Cards and rows are flat at rest.
- **Do** keep muted text at `#666666` or darker on white. Bump any `#888888` text toward ink to hit WCAG AA (≥4.5:1).
- **Do** pair every status with a non-color cue (text + icon, not green/red alone) so done/pending, won/lost, and locked/open read for color-blind users.
- **Do** keep one column, one primary action, and large tap targets — this is used on phones around match time.
- **Do** set inputs at 16px to avoid iOS zoom, and give inputs and buttons a visible Pitch-Green focus ring.
- **Do** write copy in Brazilian Portuguese; show dates in America/São_Paulo and money in BRL.

### Don't:
- **Don't** make it look like a **gambling or betting site** — no odds, neon, flashing CTAs, dark-pattern urgency, or any chrome that implies wagering or that the app moves money. It does not.
- **Don't** make it look like a **corporate SaaS dashboard** — no KPI tiles, chart soup, enterprise gray, or grids of lifted shadow cards.
- **Don't** add resting drop shadows. Shadow is reserved for true overlays (modal, popover, sticky bar).
- **Don't** introduce a second font family or a tracked all-caps eyebrow above sections.
- **Don't** carry two danger reds — consolidate `#B00020` onto `#CC0000`.
- **Don't** use `#888888` or lighter for any text the user must read.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards or rows; use a full hairline border or the Pitch-Green tint fill instead.
- **Don't** let Pitch Green spread past actions and the leader highlight; if it covers large surfaces it stops meaning "action".
