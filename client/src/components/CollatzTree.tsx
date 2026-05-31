import { useMemo } from "react";
import { nextOddDescendant } from "@/lib/collatz";

/**
 * Visualize the discovered odd numbers as a tree with 1 at the root.
 * Each discovered odd connects to its nearest downstream odd on the route to 1.
 * Layout: BFS from 1 (root) up. Width is computed per level.
 */
export function CollatzTree({
  discoveredOdds,
  currentNumber,
}: {
  discoveredOdds: number[];
  currentNumber: number;
}) {
  const layout = useMemo(() => buildTree(discoveredOdds), [discoveredOdds]);
  const { nodes, edges, width, height } = layout;

  return (
    <div
      className="w-full overflow-x-auto rounded-xl border bg-card p-3 sm:p-4"
      data-testid="region-tree"
    >
      <svg
        role="img"
        aria-label="Collatz discovery tree"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxHeight: 380, minHeight: 180 }}
      >
        {/* Edges */}
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="hsl(var(--muted-foreground) / 0.45)"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        ))}
        {/* Nodes */}
        {nodes.map((n) => {
          const isRoot = n.value === 1;
          const isCurrent = n.value === currentNumber;
          const fill = isRoot
            ? "hsl(var(--primary))"
            : isCurrent
            ? "hsl(var(--primary) / 0.18)"
            : "hsl(var(--card))";
          const stroke = isRoot
            ? "hsl(var(--primary))"
            : isCurrent
            ? "hsl(var(--primary))"
            : "hsl(var(--odd-color) / 0.85)";
          const textFill = isRoot ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";
          const r = isRoot ? 18 : 16;
          return (
            <g key={n.value} data-testid={`tree-node-${n.value}`}>
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCurrent ? 2.5 : 1.6}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize={n.value > 9999 ? 9 : n.value > 999 ? 10 : 12}
                fontFamily="var(--font-sans)"
                fontWeight={600}
                fill={textFill}
              >
                {n.value}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {discoveredOdds.length === 0 ? (
          <>
            The root <span className="font-semibold text-foreground">1</span>{" "}
            is waiting. Odd numbers join the tree as you discover them.
          </>
        ) : (
          <>
            Odd-only view: lines skip the even stepping-stones and connect each
            discovered odd to the nearest known odd on its way down to{" "}
            <span className="font-semibold text-foreground">1</span>.
          </>
        )}
      </p>
    </div>
  );
}

type TreeNode = { value: number; x: number; y: number; depth: number };
type TreeEdge = { x1: number; y1: number; x2: number; y2: number };

function buildTree(discoveredOdds: number[]): {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
} {
  // Always include 1 as root. Add 1 implicitly.
  const valuesArr: number[] = [1];
  for (const o of discoveredOdds) if (o !== 1) valuesArr.push(o);
  const knownValues = new Set(valuesArr);
  // Build parent map: parent(n) = nearest known downstream odd (or root 1).
  // This keeps the discovered tree connected even before all intermediate odd
  // numbers on a route have appeared in the player's sequence.
  const parentOf = new Map<number, number>();
  for (const n of valuesArr) {
    if (n === 1) continue;
    parentOf.set(n, nearestKnownOddDescendant(n, knownValues));
  }
  // Group by depth (distance from 1 in the discovered tree).
  const depthOf = new Map<number, number>();
  depthOf.set(1, 0);
  let changed = true;
  let safety = 0;
  while (changed && safety++ < 200) {
    changed = false;
    for (const n of valuesArr) {
      if (depthOf.has(n)) continue;
      const p = parentOf.get(n);
      if (p !== undefined && depthOf.has(p)) {
        depthOf.set(n, (depthOf.get(p) ?? 0) + 1);
        changed = true;
      }
    }
  }
  for (const n of valuesArr) {
    if (!depthOf.has(n)) depthOf.set(n, 1);
  }

  // Group nodes by depth and order each level.
  const levels = new Map<number, number[]>();
  Array.from(depthOf.entries()).forEach(([n, d]) => {
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(n);
  });
  Array.from(levels.values()).forEach((arr: number[]) => arr.sort((a: number, b: number) => a - b));

  const depthKeys = Array.from(levels.keys());
  const maxDepth = Math.max(...depthKeys);
  const maxWidth = Math.max(...Array.from(levels.values()).map((a: number[]) => a.length));
  const colSpacing = 64;
  const rowSpacing = 70;
  const pad = 40;
  const width = Math.max(420, maxWidth * colSpacing + pad * 2);
  const height = (maxDepth + 1) * rowSpacing + pad;

  const nodes: TreeNode[] = [];
  const positionOf = new Map<number, { x: number; y: number }>();
  for (let d = 0; d <= maxDepth; d++) {
    const arr = levels.get(d) ?? [];
    const totalW = (arr.length - 1) * colSpacing;
    const startX = width / 2 - totalW / 2;
    // y = bottom for root (depth 0), going UP as depth grows
    const y = height - pad - d * rowSpacing;
    arr.forEach((v, i) => {
      const x = startX + i * colSpacing;
      nodes.push({ value: v, x, y, depth: d });
      positionOf.set(v, { x, y });
    });
  }

  const edges: TreeEdge[] = [];
  Array.from(parentOf.entries()).forEach(([child, parent]) => {
    const c = positionOf.get(child);
    const p = positionOf.get(parent);
    if (!c || !p) return;
    edges.push({ x1: c.x, y1: c.y, x2: p.x, y2: p.y });
  });

  return { nodes, edges, width, height };
}

function nearestKnownOddDescendant(n: number, knownValues: Set<number>): number {
  let cur = nextOddDescendant(n);
  let safety = 0;

  while (cur !== 1 && !knownValues.has(cur) && safety++ < 200) {
    cur = nextOddDescendant(cur);
  }

  return knownValues.has(cur) ? cur : 1;
}
