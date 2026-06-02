# Technical Audit — `src/app` (baseline)

> Code-level technical audit of the `src/app` UI surface (accessibility, performance, theming, responsive, anti-patterns). Read-only baseline captured **2026-06-02**, before the fix pass that followed. Method: 5 dimensions scored 0–4, every finding adversarially verified against the real file/line by independent agents (61 agents; 10 candidate findings refuted as false positives or AAA-not-AA over-claims). Generated via `/impeccable audit src/app`.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2/4 | Systemic sub-AA contrast (`#888`≈3.5:1, `#999`≈2.8:1, accent-green links 3.07:1, WhatsApp button 1.98:1) against a committed-AA product |
| 2 | Performance | 3/4 | N+1 sequential queries per locked match on `/palpites`; otherwise lean RSC baseline |
| 3 | Theming | 2/4 | Main flow tokenized, but admin + all text color bypass tokens; no foreground token; two danger reds |
| 4 | Responsive Design | 3/4 | Genuinely mobile-first; `/palpites` row can crush at 320px; nav-by-text-link |
| 5 | Anti-Patterns | 2/4 | Zero AI-slop tells, but two parallel button vocabularies + no error/loading boundaries |
| **Total** | | **12/20** | **Acceptable (significant work needed)** |

> Dimension agents proposed a11y=1 and theming=1; reconciled to 2 each because the "1" band descriptors ("few ARIA labels, no keyboard nav" / "mostly hard-coded") factually mismatch the evidence (real labels, semantic table, ARIA tablist; the main flow IS tokenized).

## Anti-Patterns Verdict

**Does this look AI-generated? No — it passes the slop test.** Zero classic tells: no gradient text, glassmorphism, tracked uppercase eyebrows, hero-metric template, identical card grids, or side-stripe borders. The flat design, single Open Sans, one committed green, and sentence-case pt-BR are deliberate, on-brand choices. What holds the dimension at 2 is **internal inconsistency**: two parallel button vocabularies (`<Button>` vs hand-rolled), no error/loading boundaries, and an ungoverned 8-step gray ramp.

## Executive Summary

- **Health: 12/20 (Acceptable).**
- **44 verified findings — 0 P0 · 9 P1 · 23 P2 · 12 P3** (10 further candidates refuted). Several P1s are the same systemic contrast defect counted per screen.
- **Top issues:**
  1. **Systemic sub-AA text contrast** — `#888888` (≈3.54:1) status on dashboard/palpites/verify-request; `#999999` (≈2.85:1) admin instructions/payment status. WCAG 1.4.3.
  2. **Accent green `#06AA48` as small link/body text** (≈3.07:1) — dashboard, palpites, ranking, join, admin. WCAG 1.4.3.
  3. **WhatsApp share button** white-on-`#25D366` ≈ **1.98:1** (admin invite).
  4. **N+1 queries on `/palpites`** — ~3 sequential DB round-trips per locked match in a loop.
  5. **No error/loading/not-found boundaries** — server actions `throw` raw errors → unstyled crash page.

## Findings by severity

### P1 (themes)
| Issue | Location | Cat | Standard |
|---|---|---|---|
| Sub-AA gray text (systemic) `#888`≈3.54:1, `#999`≈2.85:1 | dashboard:109,112 · palpites:152,162,176 · verify-request:9 · admin:110,151,192 · bracket:71 | A11y | WCAG 1.4.3 |
| Accent green as small text/links ≈3.07:1 | dashboard:38,122 · palpites:24 · ranking:18 · join:86 · admin:62 | A11y | WCAG 1.4.3 |
| WhatsApp button white-on-green 1.98:1 | admin:231-238 | A11y | WCAG 1.4.3 |
| N+1 sequential queries per locked match | palpites:67-89 | Perf | — |
| Heading hierarchy skips h2 (h1→h3) | bracket(page:15+Bracket:66) · palpites:93,172 | A11y | WCAG 1.3.1 |

### P2 (selected)
- Button has no custom focus ring; login input suppresses its outline (`outline-none`, login:38). *(corrected P1→P2: focus present elsewhere via UA default.)*
- Palpites score inputs have no accessible name (palpites:124-140).
- Incomplete ARIA tablist in Bracket (no `tabpanel`/`aria-controls`/arrow-keys) — Bracket:108-137.
- Flag `<img alt>` is the raw country code (Flag:37) — should be decorative `alt=""`.
- Errors thrown not surfaced (login:14, palpites/actions:23); no `error/loading/not-found` boundaries.
- No `<nav>` landmark; `<th>` missing `scope="col"` (RankingTable:42-45); email missing `autocomplete`; placeholder color unset; `AutoRefresh` 45s with no pause/reduced-motion (WCAG 2.2.2); `pools/new` focus + currency validation.
- Theming: admin bypasses bg/border tokens; no foreground text token (8-gray ramp); two danger reds `#CC0000` vs `#B00020`.
- Responsive: nav-as-text-links (~24px); `/palpites` row can crush at 320px.
- Anti-patterns: two parallel button vocabularies.

### P3 (12, grouped)
Redundant per-match `match.findUnique`; double-serialized admin `<select>`; `Flag` missing `width`/`height` (CLS); off-token colors in Bracket/Button/RankingTable + `#EEEEEE` dividers; dashboard match header no `truncate`; bare empty states; h1 in three near-blacks; `CopyLinkButton` no live region; raw enum tokens (`ao_vivo`) in pt-BR copy.

## Refuted (verification killed 10 false positives)
Most "touch target < 44px" findings — WCAG 2.2 AA's target floor is **24px** (SC 2.5.8), not 44px (that's AAA SC 2.5.5), and DESIGN.md explicitly prescribes the `<Button>` sizing; the em-dash "tell" (the travessão is correct pt-BR); the color-only-status finding (every status carries a text label); the leader-row finding (bold + rank number are non-color cues); a couple of over-claimed sequential-query notes whose own recommendation was "leave as-is".

## Patterns & Systemic Issues
1. Contrast is one root cause — ~3 ungoverned values (`#888`, `#999`, accent-as-text), not many.
2. No foreground/text token is the upstream cause of both the theming sprawl and the contrast failures.
3. Admin is the outlier screen (token bypass + raw buttons + worst contrast).
4. No app-level robustness layer (no `error`/`loading`/`not-found`, no `:focus-visible` base, no `prefers-reduced-motion`).

## Positive Findings
Solid semantic foundation (one `<main>`/`<h1>` per page, real `<label>`s, semantic `<table>`, ARIA tablist, correct input types); strong RSC perf posture (3 client components, `router.refresh()`, `next/font` swap, bounded queries); genuinely responsive (single-column `max-w`, intact viewport, `break-all`, two-mode Bracket); clean of AI slop; sound link text and verb+object button labels.

## Recommended Actions
1. **[P1] colorize** — fix all sub-AA contrast (grays → ≥`#595959`; accent green link token; WhatsApp dark text) + consolidate gray ramp and two reds into tokens.
2. **[P1] optimize** `palpites/page.tsx` — batch the N+1.
3. **[P2] harden** — `error/not-found/loading` boundaries + `role="alert"`; complete Bracket tablist; AutoRefresh pause + reduced-motion; heading hierarchy; `<th scope>`; `autocomplete`.
4. **[P2] polish** `Button` + login input — focus-visible ring + global `:focus-visible` base.
5. **[P2] distill** admin — raw buttons → `<Button>` + tokens.
6. **[P2] layout** — shared `<nav>` landmark; `/palpites` row crush.
7. **[P3] clarify** — Flag alt, palpites input labels, enum→pt-BR labels.
8. **polish** — final pass; re-run `/impeccable audit src/app`.

---

# Post-fix re-audit (2026-06-02)

All recommended actions were applied across `src/app` + components and re-audited (5 dimension re-scorers + a regression hunter, every fix verified in code).

## New Health Score: **18/20 — Excellent** (was 12/20)

| # | Dimension | Before | After | What changed |
|---|-----------|:--:|:--:|---|
| 1 | Accessibility | 2 | **3** | All sub-AA grays → AA text tokens; global `:focus-visible` + per-`Button` ring; `aria-label` on score inputs; `h1→h2` fixed; `<th scope>`; completed ARIA tablist; `<nav>` landmark + `aria-current`; decorative Flag alt; AutoRefresh reduced-motion + tab-hidden pause (SC 2.2.2); `role="alert"` on error states. |
| 2 | Performance | 3 | **3** | Palpites N+1 batched (`Promise.all` + one membership query); `Flag` intrinsic dims. (Residual: `getVisiblePredictions` still re-reads each match row — bounded, concurrent.) |
| 3 | Theming | 2 | **4** | Inline hex eliminated (only the allowed WhatsApp `#25D366` remains); foreground text ramp tokens added; two danger reds → one `--color-perigo`; consistent heading color. |
| 4 | Responsive | 3 | **4** | `min-w-0`/`truncate`/`shrink-0` on match rows; nav as real tappable controls; AppNav horizontal-scrolls; no new overflow. |
| 5 | Anti-Patterns | 2 | **4** | Button vocabulary consolidated onto `<Button>` (+ `danger` variant); `error`/`loading`/`not-found` boundaries added; gray ramp governed by tokens. Still clean of AI slop. |

## Foundation added
- `src/app/globals.css`: text/danger/`verde-texto` tokens, global `:focus-visible`, AA placeholder color, `prefers-reduced-motion` block.
- `src/components/Button.tsx`: focus-visible ring + `danger` outline variant.
- New: `src/components/AppNav.tsx` (nav landmark), `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/loading.tsx`.

## Verified
`tsc --noEmit` clean · `eslint` 0 problems · `next build` succeeds (13 routes) · **186/186 tests pass** (full suite, Neon test DB) · new token utilities confirmed in production CSS.

## Known residuals (not regressions; deferred by design)
- `getVisiblePredictions` re-fetches each match row (`src/server/predictions.ts:71`) — server-layer N+1, bounded and concurrent; out of this UI pass's scope.
- White-on-`verde-acao` at 14px-bold (primary `<Button>` label, Bracket selected tab) ≈ 3.07:1 — the established brand-CTA pattern (DESIGN.md blesses `verde-acao` for fills/large-bold); not flagged by the audit. The admin prize total uses it at 24px-bold, which passes the 3:1 large-text floor.
- Empty states remain bare text — consistent with the intentional flat product UI (candidate for a future `/impeccable onboard`).
