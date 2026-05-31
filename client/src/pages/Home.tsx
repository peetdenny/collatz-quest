import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Star,
  Trophy,
  Dice5,
  Sun,
  Moon,
  Wand2,
  Cloud,
  CloudOff,
  Loader2,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { CollatzTree } from "@/components/CollatzTree";
import {
  fullSequence,
  nextCollatz,
  operationLabel,
  parity,
} from "@/lib/collatz";
import {
  CLOUD_SAVE_ENABLED,
  saveSharedProgress,
  subscribeToSharedProgress,
  type ProgressSave,
} from "@/lib/firebaseProgress";

// ---------- Constants ----------
const QUICK_STARTS = Array.from({ length: 30 }, (_, i) => i + 1);
const DEFAULT_START = 17;
const INTERESTING_STARTS = [27, 41, 47, 54, 55, 62, 63, 71, 73, 97];

type Difficulty = "easy" | "classic" | "challenge";
type Feedback =
  | { kind: "idle" }
  | { kind: "correct"; message: string; opLabel: string }
  | { kind: "hint"; level: 1 | 2; message: string }
  | { kind: "victory"; steps: number };
type CloudStatus = "connecting" | "saving" | "saved" | "error" | "off";

type BadgeItem = {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  icon: "spark" | "star" | "trophy";
};

// ---------- Helpers ----------
function nextUnfinishedStart(
  completed: Set<number>,
  preferred = DEFAULT_START,
): number {
  const cleanPreferred = Math.max(1, Math.min(9999, Math.floor(preferred)));
  if (!completed.has(cleanPreferred)) return cleanPreferred;

  const candidates = [...QUICK_STARTS, ...INTERESTING_STARTS];
  const next = candidates.find((n) => !completed.has(n));
  if (next) return next;

  for (let n = QUICK_STARTS.length + 1; n <= 9999; n += 1) {
    if (!completed.has(n)) return n;
  }

  return DEFAULT_START;
}

function randomStart(completed: Set<number>): number {
  // Bias toward interesting starts <= 60
  const choices = [
    ...QUICK_STARTS,
    ...QUICK_STARTS,
    ...INTERESTING_STARTS,
  ].filter((n) => !completed.has(n));

  if (choices.length === 0) return nextUnfinishedStart(completed);

  return choices[Math.floor(Math.random() * choices.length)];
}

function congrats() {
  const options = [
    "Nice!",
    "Yes!",
    "Spot on!",
    "Beautiful!",
    "Sharp!",
    "Way to go!",
    "Brilliant!",
    "Onward!",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function progressKey(progress: ProgressSave): string {
  return JSON.stringify({
    stars: progress.stars,
    streak: progress.streak,
    longestChain: progress.longestChain,
    discoveredOdds: [...progress.discoveredOdds].sort((a, b) => a - b),
    completedStarts: [...progress.completedStarts].sort((a, b) => a - b),
    difficulty: progress.difficulty,
  });
}

// ---------- Theme toggle (no storage) ----------
function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? true
      : false,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, setDark } as const;
}

// ---------- Main page ----------
export default function Home() {
  const { dark, setDark } = useDarkMode();
  const [start, setStart] = useState<number>(DEFAULT_START);
  const [sequence, setSequence] = useState<number[]>([DEFAULT_START]);
  const [answer, setAnswer] = useState<string>("");
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [attempts, setAttempts] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [wrongStreak, setWrongStreak] = useState<number>(0);
  const [stars, setStars] = useState<number>(0);
  const [discoveredOdds, setDiscoveredOdds] = useState<number[]>([]);
  const [longestChain, setLongestChain] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("classic");
  const [recentOp, setRecentOp] = useState<string | null>(null);
  const [completedStarts, setCompletedStarts] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    CLOUD_SAVE_ENABLED ? "connecting" : "off",
  );
  const [cloudHydrated, setCloudHydrated] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCloudKey = useRef<string>("");
  const saveTimer = useRef<number | null>(null);

  const current = sequence[sequence.length - 1];
  const expected = nextCollatz(current);
  const atOne = current === 1;
  const progressSave = useMemo<ProgressSave>(
    () => ({
      stars,
      streak,
      longestChain,
      discoveredOdds,
      completedStarts: Array.from(completedStarts).sort((a, b) => a - b),
      difficulty,
    }),
    [completedStarts, difficulty, discoveredOdds, longestChain, stars, streak],
  );

  // Shared Firebase progress. Perplexity still hosts the app; Firestore stores
  // one family profile so progress follows the same link across devices.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    setCloudStatus(CLOUD_SAVE_ENABLED ? "connecting" : "off");
    subscribeToSharedProgress(
      (cloudProgress) => {
        if (cancelled) return;

        if (cloudProgress) {
          lastCloudKey.current = progressKey(cloudProgress);
          setStars(cloudProgress.stars);
          setStreak(cloudProgress.streak);
          setLongestChain(cloudProgress.longestChain);
          setDiscoveredOdds(cloudProgress.discoveredOdds);
          setCompletedStarts(new Set(cloudProgress.completedStarts));
          setDifficulty(cloudProgress.difficulty);
        }

        setCloudHydrated(true);
        setCloudStatus(CLOUD_SAVE_ENABLED ? "saved" : "off");
      },
      (error) => {
        console.error("Firebase progress error", error);
        if (!cancelled) {
          setCloudHydrated(true);
          setCloudStatus("error");
        }
      },
    )
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      })
      .catch((error) => {
        console.error("Firebase sign-in error", error);
        if (!cancelled) {
          setCloudHydrated(true);
          setCloudStatus("error");
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!cloudHydrated || cloudStatus === "error" || cloudStatus === "off") return;

    const nextKey = progressKey(progressSave);
    if (nextKey === lastCloudKey.current) return;

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setCloudStatus("saving");

    saveTimer.current = window.setTimeout(() => {
      saveSharedProgress(progressSave)
        .then(() => {
          lastCloudKey.current = nextKey;
          setCloudStatus("saved");
        })
        .catch((error) => {
          console.error("Firebase save error", error);
          setCloudStatus("error");
        });
    }, 700);
  }, [cloudHydrated, cloudStatus, progressSave]);

  // Auto-discover odd numbers after play begins. The chosen start number joins
  // the tree once the learner has successfully made the first move, avoiding a
  // misleading "already discovered" state at 0 steps.
  useEffect(() => {
    setDiscoveredOdds((prev) => {
      const set = new Set(prev);
      if (sequence.length < 2) return Array.from(set).sort((a, b) => a - b);
      for (const n of sequence.slice(0, -1)) {
        if (n > 1 && n % 2 === 1) set.add(n);
      }
      return Array.from(set).sort((a, b) => a - b);
    });
  }, [sequence]);

  // When sequence reaches 1, award badge + streak handling
  useEffect(() => {
    if (atOne) {
      const steps = sequence.length - 1;
      setLongestChain((prev) => Math.max(prev, steps));
      setCompletedStarts((prev) => {
        const next = new Set(prev);
        next.add(start);
        return next;
      });
      setFeedback({ kind: "victory", steps });
    }
  }, [atOne, start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input on new start
  useEffect(() => {
    if (!atOne) inputRef.current?.focus();
  }, [start, atOne]);

  // ---------- Actions ----------
  const beginAt = useCallback(
    (n: number) => {
      const clean = Math.max(1, Math.min(9999, Math.floor(n)));
      const chosen = completedStarts.has(clean)
        ? nextUnfinishedStart(completedStarts, clean + 1)
        : clean;

      setStart(chosen);
      setSequence([chosen]);
      setAnswer("");
      setAttempts(0);
      setWrongStreak(0);
      setRecentOp(null);
      setFeedback({ kind: "idle" });
    },
    [completedStarts],
  );

  useEffect(() => {
    if (!cloudHydrated) return;
    if (sequence.length === 1 && completedStarts.has(start)) {
      beginAt(start);
    }
  }, [beginAt, cloudHydrated, completedStarts, sequence.length, start]);

  const submit = useCallback(() => {
    if (atOne) return;
    const v = Number(answer.trim());
    if (!Number.isFinite(v)) {
      setFeedback({
        kind: "hint",
        level: 1,
        message: "Hmm, that doesn’t look like a number. Try again — you’ve got this.",
      });
      return;
    }
    if (v === expected) {
      const op = operationLabel(current);
      setSequence((seq) => [...seq, v]);
      setAnswer("");
      setAttempts(0);
      setStreak((s) => s + 1);
      setWrongStreak(0);
      setStars((s) => s + (attempts === 0 ? 2 : 1));
      setRecentOp(op);
      setFeedback({ kind: "correct", message: congrats(), opLabel: op });
    } else {
      const a = attempts + 1;
      setAttempts(a);
      setStreak(0);
      setWrongStreak((w) => w + 1);
      const isEven = parity(current) === "even";
      let msg = "";
      let level: 1 | 2 = 1;
      if (a === 1 || difficulty === "easy") {
        msg = isEven
          ? `${current} is even, so the rule is: halve it. What is ${current} ÷ 2?`
          : `${current} is odd, so the rule is: triple it and add 1. What is 3 × ${current} + 1?`;
        level = 1;
      } else {
        msg = isEven
          ? `Try ${current} ÷ 2 — that’s the even rule.`
          : `Try 3 × ${current} + 1 — that’s the odd rule.`;
        level = 2;
      }
      setFeedback({ kind: "hint", level, message: msg });
    }
  }, [answer, attempts, atOne, current, difficulty, expected]);

  // Known tail to 1 from current. A route only counts as "known" after the
  // learner has completed a sequence containing that number.
  const knownRouteNumbers = useMemo(() => {
    const known = new Set<number>();
    completedStarts.forEach((n) => {
      fullSequence(n).forEach((value) => known.add(value));
    });
    return known;
  }, [completedStarts]);

  const knownTail = useMemo(() => {
    if (atOne) return null;
    return fullSequence(current);
  }, [current, atOne]);

  // Reveal known tail only when there is genuine convergence with a route
  // completed earlier. No preloaded shortcuts.
  const showKnownTail =
    knownTail !== null &&
    knownRouteNumbers.has(current) &&
    !(sequence.length === 1 && current === start);

  const applyKnownTail = useCallback(() => {
    if (!knownTail || knownTail.length < 2 || atOne) return;

    const tailToAdd = knownTail.slice(1);
    setSequence((seq) => [...seq, ...tailToAdd]);
    setAnswer("");
    setAttempts(0);
    setWrongStreak(0);
    setRecentOp(null);
    setFeedback({
      kind: "correct",
      message: "Great spot — that path is now added to your chain.",
      opLabel: `${knownTail.length - 1} known step${knownTail.length === 2 ? "" : "s"} applied`,
    });
  }, [atOne, knownTail]);

  // Badges
  const earnedBadges: BadgeItem[] = useMemo(() => {
    return [
      {
        id: "first-flight",
        label: "First Flight",
        description: "Finish your first sequence",
        earned: completedStarts.size >= 1,
        icon: "spark",
      },
      {
        id: "ten-odds",
        label: "Odd Collector",
        description: "Discover 10 different odd numbers",
        earned: discoveredOdds.length >= 10,
        icon: "star",
      },
      {
        id: "long-chain",
        label: "Long Chain",
        description: "Complete a sequence of 20+ steps",
        earned: longestChain >= 20,
        icon: "trophy",
      },
      {
        id: "streak-five",
        label: "On Fire",
        description: "Get 5 in a row without a hint",
        earned: streak >= 5,
        icon: "spark",
      },
      {
        id: "explorer",
        label: "Explorer",
        description: "Finish sequences from 5 different starts",
        earned: completedStarts.size >= 5,
        icon: "trophy",
      },
    ];
  }, [completedStarts.size, discoveredOdds.length, longestChain, streak]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-primary"><Logo size={36} /></span>
            <div>
              <h1
                className="font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
                data-testid="text-app-title"
              >
                Hailstones
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                A Collatz Adventure · the 3n + 1 puzzle
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CloudSaveStatus status={cloudStatus} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDark(!dark)}
              data-testid="button-toggle-theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3">
        {/* LEFT: Game */}
        <section className="lg:col-span-2 space-y-6">
          {/* Rule card */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold tracking-tight">
                  The Rule
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick any whole number. Follow the rule. Watch it fall to 1.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-even text-even">
                  Even? <span className="ml-1 font-semibold">÷ 2</span>
                </Badge>
                <Badge variant="outline" className="border-odd text-odd">
                  Odd? <span className="ml-1 font-semibold">× 3 + 1</span>
                </Badge>
                <Badge variant="outline" className="border-primary text-primary">
                  Stop at <span className="ml-1 font-semibold">1</span>
                </Badge>
              </div>
            </div>
          </Card>

          {/* Sequence + input */}
          <Card className="p-4 sm:p-6">
            <MoodMeter correctStreak={streak} wrongStreak={wrongStreak} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Starting number
                </p>
                <p
                  className="font-display text-2xl font-bold tabular-nums"
                  data-testid="text-start-number"
                >
                  {start}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Steps so far
                </p>
                <p
                  className="font-display text-2xl font-bold tabular-nums"
                  data-testid="text-step-count"
                >
                  {sequence.length - 1}
                </p>
              </div>
            </div>

            {/* Sequence pills */}
            <div
              className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2"
              aria-label="Sequence so far"
              data-testid="region-sequence"
            >
              {sequence.map((n, i) => {
                const isLast = i === sequence.length - 1;
                const isEven = n % 2 === 0;
                return (
                  <div key={`${i}-${n}`} className="flex items-center gap-1.5">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-sm tabular-nums sm:text-base",
                        "border transition-all",
                        isLast
                          ? "border-primary bg-primary text-primary-foreground shadow-sm animate-pop-in"
                          : isEven
                          ? "border-even/40 bg-even-soft text-even"
                          : "border-odd/40 bg-odd-soft text-odd",
                      ].join(" ")}
                      data-testid={`pill-${n}-${i}`}
                    >
                      {n}
                    </span>
                    {!isLast && (
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                    )}
                  </div>
                );
              })}
              {!atOne && (
                <>
                  <span className="text-muted-foreground" aria-hidden>→</span>
                  <span
                    className="rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-sm text-muted-foreground"
                    aria-label="next number unknown"
                  >
                    ?
                  </span>
                </>
              )}
            </div>

            {/* Operation reveal */}
            {recentOp && (
              <div
                className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm shimmer-gold"
                data-testid="text-recent-operation"
              >
                <span className="font-medium">Step shown:</span> {recentOp}
              </div>
            )}

            {/* Prompt + input */}
            {!atOne ? (
              <div className="mt-5 space-y-3">
                <label
                  htmlFor="answer"
                  className="block font-display text-lg font-semibold tracking-tight"
                >
                  What is the next number after{" "}
                  <span className={parity(current) === "even" ? "text-even" : "text-odd"}>
                    {current}
                  </span>
                  ?
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="answer"
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    placeholder="Type your answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={onKey}
                    className={[
                      "max-w-[180px] text-lg tabular-nums",
                      feedback.kind === "hint" ? "animate-shake" : "",
                    ].join(" ")}
                    aria-label="your answer"
                    data-testid="input-answer"
                  />
                  <Button
                    onClick={submit}
                    size="lg"
                    data-testid="button-check"
                    className="font-semibold"
                  >
                    Check
                  </Button>
                </div>

                {/* Feedback */}
                <FeedbackLine feedback={feedback} />
              </div>
            ) : (
              <VictoryPanel
                steps={sequence.length - 1}
                onPlayAgain={() => beginAt(randomStart(completedStarts))}
              />
            )}
          </Card>

          {/* Known tail */}
          {showKnownTail && knownTail && knownTail.length > 1 && !atOne && (
            <Card
              className="cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 sm:p-5"
              data-testid="region-known-tail"
              role="button"
              tabIndex={0}
              aria-label={`Add the known path from ${current} to 1 to the current sequence`}
              onClick={applyKnownTail}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  applyKnownTail();
                }
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="font-display text-base font-semibold tracking-tight">
                  Known path unlocked
                </p>
                <Badge variant="outline" className="ml-auto">
                  {knownTail.length - 1} steps to 1
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                From <span className="font-semibold text-foreground">{current}</span> the
                route home to <span className="font-semibold text-foreground">1</span> is:
              </p>
              <p className="mt-1 text-xs font-medium text-primary">
                Click this path to add the rest to your chain.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {knownTail.map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className={[
                        "rounded-full border px-2.5 py-0.5 text-xs tabular-nums",
                        n % 2 === 0
                          ? "border-even/30 bg-even-soft text-even"
                          : "border-odd/30 bg-odd-soft text-odd",
                        n === 1 ? "border-primary bg-primary/15 text-primary" : "",
                      ].join(" ")}
                    >
                      {n}
                    </span>
                    {i < knownTail.length - 1 && (
                      <span className="text-muted-foreground/70" aria-hidden>→</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tree */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Your Discovery Tree
              </h2>
              <p className="text-xs text-muted-foreground">
                {discoveredOdds.length} odd number{discoveredOdds.length === 1 ? "" : "s"} found
              </p>
            </div>
            <CollatzTree discoveredOdds={discoveredOdds} currentNumber={current} />
          </div>
        </section>

        {/* RIGHT: Controls + progress */}
        <aside className="space-y-6">
          {/* Quick starts */}
          <Card className="p-4 sm:p-5">
            <p className="font-display text-base font-semibold tracking-tight">
              Pick a start
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Finished numbers get a ★ and won’t be asked again.
            </p>
            <div
              className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-6"
              role="group"
              aria-label="Quick start numbers"
            >
              {QUICK_STARTS.map((n) => {
                const done = completedStarts.has(n);
                const active = n === start;
                return (
                  <button
                    key={n}
                    onClick={() => beginAt(n)}
                    disabled={done}
                    aria-label={`Start at ${n}${done ? " (completed)" : ""}`}
                    data-testid={`button-quickstart-${n}`}
                    className={[
                      "relative rounded-md border px-2 py-1.5 text-sm tabular-nums",
                      done
                        ? "cursor-not-allowed opacity-45"
                        : "hover-elevate active-elevate-2 transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-card text-foreground",
                    ].join(" ")}
                  >
                    {n}
                    {done && (
                      <span className="absolute -right-1 -top-1 text-[10px] text-primary">★</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom start */}
            <div className="mt-4 flex gap-2">
              <Input
                type="number"
                placeholder="Any unfinished number"
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(n) && n >= 1) beginAt(n);
                  }
                }}
                aria-label="Custom start number"
                data-testid="input-custom-start"
              />
              <Button
                variant="outline"
                onClick={() => beginAt(randomStart(completedStarts))}
                data-testid="button-random"
                title="Random challenge"
              >
                <Dice5 className="mr-1.5 h-4 w-4" />
                Random
              </Button>
            </div>
          </Card>

          {/* Difficulty */}
          <Card className="p-4 sm:p-5">
            <p className="font-display text-base font-semibold tracking-tight">
              Difficulty
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How much help you’d like.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup">
              {(["easy", "classic", "challenge"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  data-testid={`button-difficulty-${d}`}
                  className={[
                    "rounded-md border px-2 py-1.5 text-sm capitalize transition-colors",
                    "hover-elevate active-elevate-2",
                    difficulty === d
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-card",
                  ].join(" ")}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {difficulty === "easy"
                ? "Show the rule on the first wrong answer."
                : difficulty === "classic"
                ? "A gentle parity hint, then the rule."
                : "Just a parity nudge. You’ve got this."}
            </p>
          </Card>

          {/* Progress */}
          <Card className="p-4 sm:p-5">
            <p className="font-display text-base font-semibold tracking-tight">
              Progress
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat label="Stars" value={stars} icon="star" testId="stat-stars" />
              <Stat label="Streak" value={streak} icon="spark" testId="stat-streak" />
              <Stat
                label="Longest chain"
                value={longestChain}
                icon="trophy"
                testId="stat-longest"
              />
              <Stat
                label="Odds found"
                value={discoveredOdds.length}
                icon="spark"
                testId="stat-odds-found"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Badges
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {earnedBadges.map((b) => (
                  <div
                    key={b.id}
                    className={[
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                      b.earned
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground",
                    ].join(" ")}
                    data-testid={`badge-${b.id}`}
                  >
                    <BadgeIcon kind={b.icon} active={b.earned} />
                    <span className="font-medium">{b.label}</span>
                    <span className="ml-auto text-xs opacity-80">{b.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Discovered odds list */}
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-semibold tracking-tight">
                Discovered odd numbers
              </p>
              <Wand2 className="h-4 w-4 text-muted-foreground" />
            </div>
            {discoveredOdds.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                None yet. Start a sequence — every odd number you pass through is a discovery.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {discoveredOdds.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border border-odd/30 bg-odd-soft px-2.5 py-0.5 text-xs tabular-nums text-odd"
                    data-testid={`chip-odd-${n}`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </main>

      <footer className="border-t bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          Built for curious minds. The Collatz conjecture is still unsolved —
          every number tested so far reaches 1.
        </div>
      </footer>
    </div>
  );
}

// ---------- Small subcomponents ----------
function MoodMeter({
  correctStreak,
  wrongStreak,
}: {
  correctStreak: number;
  wrongStreak: number;
}) {
  const steps = [
    { emoji: "😠", label: "10 wrong in a row", side: "wrong", threshold: 10 },
    { emoji: "😭", label: "5 wrong in a row", side: "wrong", threshold: 5 },
    { emoji: "☹️", label: "1 wrong", side: "wrong", threshold: 1 },
    { emoji: "😐", label: "Ready", side: "neutral", threshold: 0 },
    { emoji: "🙂", label: "1 right", side: "right", threshold: 1 },
    { emoji: "😄", label: "5 right in a row", side: "right", threshold: 5 },
    { emoji: "🤩", label: "10 right in a row", side: "right", threshold: 10 },
  ] as const;

  const activeIndex =
    wrongStreak >= 10
      ? 0
      : wrongStreak >= 5
      ? 1
      : wrongStreak >= 1
      ? 2
      : correctStreak >= 10
      ? 6
      : correctStreak >= 5
      ? 5
      : correctStreak >= 1
      ? 4
      : 3;

  const message =
    activeIndex === 3
      ? "Ready for the next hailstone."
      : activeIndex < 3
      ? `${wrongStreak} tricky attempt${wrongStreak === 1 ? "" : "s"} in a row. Breathe and try the rule.`
      : `${correctStreak} correct in a row. Keep climbing.`;
  const activeStep = steps[activeIndex];
  const tone =
    activeStep.side === "wrong"
      ? "border-destructive/35 bg-destructive/10"
      : activeStep.side === "right"
      ? "border-primary/35 bg-primary/10"
      : "border-border bg-card";

  return (
    <div
      className={[
        "mb-5 flex items-center gap-3 rounded-xl border px-3 py-3 transition-all",
        tone,
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-label={`Mood meter: ${message}`}
      data-testid="region-mood-meter"
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-card text-4xl shadow-sm sm:h-16 sm:w-16 sm:text-5xl"
        data-testid="mood-current-face"
        title={activeStep.label}
      >
        <span aria-hidden>{activeStep.emoji}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Current progress mood
        </p>
        <p
          className="mt-1 text-sm font-semibold text-foreground"
          data-testid="text-mood-message"
        >
          {message}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {activeStep.threshold === 0 ? "No streak yet" : activeStep.label}
        </p>
      </div>
    </div>
  );
}

function CloudSaveStatus({ status }: { status: CloudStatus }) {
  const label =
    status === "off"
      ? "Demo mode"
      : status === "connecting"
      ? "Connecting cloud save"
      : status === "saving"
      ? "Saving progress"
      : status === "saved"
      ? "Progress saved"
      : "Cloud save needs setup";

  return (
    <div
      className={[
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:flex",
        status === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : status === "off"
          ? "border-border bg-muted/50 text-muted-foreground"
          : "border-primary/25 bg-primary/10 text-primary",
      ].join(" ")}
      role="status"
      aria-live="polite"
      data-testid="status-cloud-save"
      title={label}
    >
      {status === "saving" || status === "connecting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "error" ? (
        <CloudOff className="h-3.5 w-3.5" />
      ) : (
        <Cloud className="h-3.5 w-3.5" />
      )}
      <span>
        {status === "off"
          ? "Demo mode"
          : status === "error"
          ? "Cloud setup"
          : status === "saved"
          ? "Saved"
          : "Syncing"}
      </span>
    </div>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === "idle") return null;
  if (feedback.kind === "correct") {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
        data-testid="text-feedback-correct"
      >
        <Star className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-semibold text-foreground">{feedback.message}</p>
          <p className="text-muted-foreground">{feedback.opLabel}</p>
        </div>
      </div>
    );
  }
  if (feedback.kind === "hint") {
    return (
      <div
        className="rounded-lg border border-muted-foreground/30 bg-muted/40 px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
        data-testid="text-feedback-hint"
      >
        <p className="font-medium text-foreground">Hint</p>
        <p className="text-muted-foreground">{feedback.message}</p>
      </div>
    );
  }
  return null;
}

function VictoryPanel({
  steps,
  onPlayAgain,
}: {
  steps: number;
  onPlayAgain: () => void;
}) {
  return (
    <div
      className="mt-5 rounded-xl border border-primary/40 bg-primary/10 p-5 text-center"
      data-testid="region-victory"
    >
      <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground animate-pop-in">
        <Trophy className="h-6 w-6" />
      </div>
      <p className="font-display text-xl font-bold tracking-tight">
        You reached 1 in {steps} step{steps === 1 ? "" : "s"}!
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Every hailstone falls home. Try a new starting number.
      </p>
      <Button
        className="mt-3"
        onClick={onPlayAgain}
        data-testid="button-play-again"
      >
        <Dice5 className="mr-1.5 h-4 w-4" /> Random challenge
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  testId,
}: {
  label: string;
  value: number;
  icon: "star" | "spark" | "trophy";
  testId: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <BadgeIcon kind={icon} active small />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BadgeIcon({
  kind,
  active,
  small,
}: {
  kind: "star" | "spark" | "trophy";
  active: boolean;
  small?: boolean;
}) {
  const cls = [small ? "h-3.5 w-3.5" : "h-4 w-4", active ? "text-primary" : "text-muted-foreground"].join(" ");
  if (kind === "star") return <Star className={cls} />;
  if (kind === "trophy") return <Trophy className={cls} />;
  return <Sparkles className={cls} />;
}
