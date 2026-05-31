// Collatz / 3n+1 helpers — pure functions, no state.

export type Parity = "even" | "odd";

export function parity(n: number): Parity {
  return n % 2 === 0 ? "even" : "odd";
}

export function nextCollatz(n: number): number {
  if (n <= 1) return 1;
  return n % 2 === 0 ? n / 2 : 3 * n + 1;
}

/** Full Collatz sequence starting at n, ending at 1 (inclusive). */
export function fullSequence(n: number, max = 5000): number[] {
  if (!Number.isFinite(n) || n < 1) return [1];
  const out: number[] = [n];
  let cur = n;
  while (cur !== 1 && out.length < max) {
    cur = nextCollatz(cur);
    out.push(cur);
  }
  return out;
}

/** Odd numbers visited along the route to 1 (excluding 1 itself by default). */
export function oddsOnRoute(n: number): number[] {
  const seq = fullSequence(n);
  return seq.filter((x) => x % 2 === 1 && x !== 1);
}

/** Steps from n to 1. */
export function stopTime(n: number): number {
  return Math.max(0, fullSequence(n).length - 1);
}

/** Verbalize the operation that yields the next number from n. */
export function operationLabel(n: number): string {
  if (n <= 1) return "1 is the goal — you’re here!";
  if (n % 2 === 0) return `${n} is even, so ${n} ÷ 2 = ${n / 2}`;
  return `${n} is odd, so 3 × ${n} + 1 = ${3 * n + 1}`;
}

/** For the inverse tree: nearest downstream ODD ancestor on the route to 1.
 *  Given an odd number n > 1, walk the Collatz sequence forward and return the
 *  first odd number after n on that route (or 1 if n reaches 1 only through evens). */
export function nextOddDescendant(n: number): number {
  if (n <= 1) return 1;
  let cur = nextCollatz(n);
  while (cur !== 1 && cur % 2 === 0) cur = nextCollatz(cur);
  return cur;
}
