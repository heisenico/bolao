# Product

## Register

product

## Users

A small, private group of friends in Brazil running a World Cup 2026 prediction pool ("bolão") together. One person is the **organizer/admin** (creates the pool, sets the entry value and PIX key, confirms payments, corrects results, sees who wins the prize). Everyone else is a **participant** who joins by invite link, predicts match scores, and watches the ranking.

Context of use: almost entirely on phones, often in the moment around match days — predicting before a game starts, then checking the ranking shortly after the final whistle. Casual and social, not professional. The product language is **Brazilian Portuguese (pt-BR)**; all copy must be Portuguese.

The job to be done: enter score predictions before each deadline, trust that scoring and ranking are fair and automatic, and keep the money side (entry via PIX, winner-takes-all prize) clear and honest — without the app ever holding or moving real money.

## Product Purpose

Bolão da Copa 2026 lets a group of friends predict scores for FIFA World Cup 2026 matches, scores those predictions automatically against real results, and shows a live ranking — plus a knockout bracket and semi-manual PIX payment tracking.

Scoring is deliberately simple: exact score = 3 pts, correct winner/draw only = 1 pt, wrong or no prediction = 0 pts. Predictions can be edited until 1 hour before kickoff, then lock; they stay hidden from other players until lock (anti-copy). Results come from a football data API (polled by an external scheduler only during match windows) with manual admin override taking priority.

The app **never moves, custodies, or transfers money** — it only records who paid and calculates the winner-takes-all prize; the organizer pays the winner by PIX outside the app. This is a deliberate scope choice that keeps the project out of regulatory and financial risk.

Success looks like: friends predict in seconds without confusion, nobody disputes the scoring or the deadlines, and the ranking is something they actually want to check during the tournament.

## Brand Personality

Three words: **clear, fair, low-key.**

Voice and tone: plain Brazilian Portuguese, direct and warm but brief. State what will happen ("Confirmar palpite", "Confirmar pagamento") rather than hype it. No betting jargon, no urgency tactics, no marketing buzzwords. Numbers, deadlines, and money are always unambiguous.

Emotional goals: confidence that the pool is run fairly and that predicting is effortless; a light sense of friendly competition around the leaderboard without pressure or stakes-anxiety. The app should feel like a trustworthy scoreboard among friends, not a product trying to monetize attention.

## Anti-references

- **Gambling / betting sites** (Bet365, Betano, casino-style sportsbooks). No odds, neon, dark-pattern urgency, flashing CTAs, or anything that pushes money or frames this as wagering. It is a friendly pool, not a sportsbook — the app explicitly does not operate money.
- **Corporate SaaS dashboards.** No generic admin-panel blandness: KPI tiles, chart soup, enterprise gray, dense settings grids. The admin screen is for a friend running a group, not an operations team.
- (Layout cue allowed, noise not) The ge.globo simulator is a fair reference for clean layout and the action-green palette, but **not** for sports-portal ad density or news clutter.

## Design Principles

1. **As simple and functional as possible.** The guiding rule from day one: anything that adds cost, complexity, or regulatory risk is cut or deferred. Every screen earns its place; YAGNI is the default.
2. **The app records and calculates, never moves money.** Money handling is transparent and honest, but custody and transfers stay outside the app. Design the PIX and prize flows to make this boundary obvious, not hidden.
3. **Fairness is provable, not promised.** Predictions hidden until lock, deadlines enforced server-side in UTC, scoring rules fixed after the first match, auditable timestamps. The UI should make the fairness mechanisms visible (locked state, deadlines, your-vs-others visibility) so no friend ever suspects the pool is rigged.
4. **Clarity over cleverness.** One obvious primary task per screen. Deadlines, scores, payment status, and ranking position read instantly and unambiguously — no decoration that competes with the data that matters.
5. **Mobile-first, match-day ready.** Designed for phones used in the moment around games: large tap targets, fast prediction entry, legible at a glance. Desktop is an enhancement, never the baseline.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA.** Body text ≥4.5:1 contrast against its background; large/bold text ≥3:1; visible keyboard focus on all interactive elements.
- **Known gap to fix:** the current muted gray `#888888` on white (used for status text like "palpite pendente" / "travado" and secondary labels) is roughly 3.5:1 and fails AA for body text. Bump muted text toward the ink end of the ramp.
- **Localization:** the product is Brazilian Portuguese; dates shown in America/São_Paulo, currency in BRL. Copy and labels must be Portuguese.
