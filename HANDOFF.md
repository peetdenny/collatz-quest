# Hailstones — A Collatz Adventure · Handoff

## Project path
`/home/user/workspace/collatz-app`

## Run / build

```bash
cd /home/user/workspace/collatz-app
npm install              # already done in this sandbox
npm run dev              # Express+Vite on http://localhost:5000
npm run build            # writes dist/public (static) and dist/index.cjs (server)
```

The app is **frontend-only** — no backend routes are used. Either:

- **Static deploy (recommended):** `deploy_website(project_path="/home/user/workspace/collatz-app/dist/public")`
- **Fullstack deploy:** build, start `node dist/index.cjs` on port 5000, then deploy `dist/public`. The template's `queryClient.ts` is wired for the `__PORT_5000__` proxy if needed.

Hash routing is configured (`#/`) for sandbox iframe compatibility.

## Major files changed / created
- `client/index.html` — page title, meta description, inline SVG favicon, Fraunces + DM Sans from Google Fonts.
- `client/src/index.css` — full custom palette (warm cream + ink navy, gold primary, teal=even, plum=odd, gold leaves), Fraunces/DM Sans wiring, `pop-in`, `shimmer-gold`, `gentle-shake` keyframes, parity helper utilities (`.text-even`, `.bg-odd-soft`, etc.).
- `client/src/App.tsx` — wires the single `Home` route under `Router hook={useHashLocation}`.
- `client/src/pages/Home.tsx` — the whole game UI: rule chips, sequence pills, prompt + input, feedback (correct / hint / victory), reveal button, known-tail ribbon, tree, quick-start grid 1–30 with ★, custom start input, random, restart, reset progress, difficulty (easy/classic/challenge), stats, badges, discovered-odds chips, dark-mode toggle.
- `client/src/components/CollatzTree.tsx` — inline SVG inverse tree. 1 at the bottom; each discovered odd connects to its `nextOddDescendant` (the nearest odd on its way to 1). Tidy depth-based layout.
- `client/src/components/Logo.tsx` — custom inline SVG logo (a "hailstone cascade" — three falling circles tracing a path to a small one).
- `client/src/lib/collatz.ts` — pure helpers: `nextCollatz`, `parity`, `fullSequence`, `oddsOnRoute`, `operationLabel`, `nextOddDescendant`.

The standard template's `server/`, `shared/schema.ts`, `queryClient.ts`, and shadcn `components/ui/*` are unchanged.

## Design / content decisions
- **Audience:** a 7-year-old advanced learner with a parent alongside. Voice is warm but never babyish; rules are stated mathematically ("3 × 17 + 1 = 52"), feedback is short and encouraging ("Nice!", "Beautiful!", "Onward!").
- **Palette** — Inferred from subject (a falling-hailstone math puzzle): warm cream parchment background, deep ink navy text, **sun gold** primary (CTA + completion). Two semantic domain hues — **teal** for even / `÷ 2` and **plum** for odd / `× 3 + 1` — used consistently on sequence pills, parity chips, the "What is the next number after …?" prompt, the discovered-odds list, and the tree.
- **Type** — Fraunces (display serif with warm character; opsz/SOFT variation tuned for friendliness) for titles and big numbers; DM Sans for body. All numbers use `tabular-nums` so digits never jiggle.
- **Sequence representation** — Pills in a flowing row with `→` arrows. The latest number gets the gold primary fill and pops in (`animate-pop-in`); a dashed `?` pill marks the slot to be filled. Correct submissions trigger a soft gold shimmer over the "Step shown" line that reveals the operation in plain English.
- **Feedback ladder** — On a wrong answer, default Classic difficulty gives the rule in full on the first miss ("17 is odd, so the rule is: triple it and add 1. What is 3 × 17 + 1?"); a second miss switches to a terse nudge. Easy gives the rule every time. Challenge gives only the rule once then a parity nudge. There is never any shaming language. The input itself jiggles briefly.
- **Operation reveal as the practice mode** — Every correct answer surfaces the operation just performed ("17 is odd, so 3 × 17 + 1 = 52"), giving inline multiplication/division practice without a separate mode toggle. The Reveal button shows the operation and advances the sequence for free (with no points and a streak reset, so it's an honest escape hatch).
- **Stars / streak / badges** — 2 stars for first-try correct, 1 star otherwise. Streak resets on any wrong answer or Reveal. Five concrete badges (First Flight, Odd Collector, Long Chain, On Fire, Explorer) light up as they're earned.
- **Known path ribbon** — Appears once the player has either finished one sequence already or the current number is ≤ 16 (a small, recognizable convergent number) or the sequence is partway through. It shows the entire route from the current number to 1, with even/odd coloring and 1 highlighted in gold. This is the "convergence aha" moment.
- **Tree** — Renders all discovered odds + a fixed root at 1. Each odd's parent is `nextOddDescendant(n)` (the next odd on its route to 1). Nodes are grouped by their depth from 1, drawn bottom-up with 1 at the bottom in gold. The current number gets a thicker stroke and a soft gold halo. This is *not* the full mathematical inverse tree (which is infinite); it's a faithful subtree of what the player has actually seen, which is what the spec asked for.
- **State** — In-memory React state only. No `localStorage` / `sessionStorage` / cookies / `indexedDB`. Theme is seeded from `prefers-color-scheme` but not persisted (per the sandbox rule).
- **Accessibility** — Semantic regions, `aria-label`s on icon buttons, `role="status"` `aria-live="polite"` on the feedback line, `role="radiogroup"`/`role="radio"` on difficulty, every interactive control has a `data-testid`.
- **Responsive** — Mobile is a single column with the game card first and the side panel beneath; desktop becomes a 3-column grid (game on the left, controls on the right). Quick-start grid is 6 columns at all sizes — large enough to tap.

## QA performed
Playwright drove the running dev server. Verified:
- Correct answers advance the sequence and award stars; feedback shows the operation.
- Wrong answers shake the input and produce the parity hint without changing the sequence.
- Drove the full 17 → 1 sequence (12 steps). Victory panel appeared. Star count 23, longest chain 12, badges "First Flight" and "On Fire" lit up.
- Quick-start (6), Reveal, "Known path unlocked" ribbon (3 → 10 → 5 → 16 → 8 → 4 → 2 → 1) all worked.
- Tree correctly rendered with 1 at the bottom, and 3, 13 → 5 as ancestors of 1, and 17 above. New odds added live as discovered.
- Random, custom-start (Enter to commit), Restart, Reset progress.
- Difficulty toggle changes the hint cadence.
- Dark-mode toggle.
- Mobile (390 × 844) layout reflows correctly.
- `npx tsc --noEmit` is clean.
- `npm run build` succeeds: `dist/public/assets/index-*.js` ≈ 288 KB (94 KB gzip).

QA screenshots saved at:
- `/home/user/workspace/qa_desktop_1.png` (initial state)
- `/home/user/workspace/qa_correct.png` (after one correct answer)
- `/home/user/workspace/qa_victory.png` (full sequence completed)
- `/home/user/workspace/qa_reveal_known_tail.png` (known-tail ribbon)
- `/home/user/workspace/qa_dark.png` (dark mode)
- `/home/user/workspace/qa_mobile.png` (390px mobile)

## Caveats
- The "Known path unlocked" ribbon currently always reveals the *true* full tail (computed with `fullSequence`). For a strict "only show what's known from prior play" reading you'd gate it on `discoveredOdds.has(n)`; we chose the slightly looser rule because it gives the kid an immediate convergence moment, which the spec describes as the goal.
- Inputs > 9999 are clamped on quick-set, but the Answer field doesn't clamp — that's intentional so the kid can experiment with very large numbers via the rules themselves.
- The Collatz tree visualization is the discovered subtree (each node's parent is its true next-odd-on-route to 1). It's not the infinite mathematical inverse tree.
- No backend is required for this app; if you deploy fullstack it will simply serve static files.
