// Lays out a pull request as a blast radar: changed files on the innermost
// ring, each ring outwards one more import away, and the circle cut into
// slices by area so a reader can see where the change spreads.

import { areaOf, ROOT_AREA } from "@/lib/area";
import type { Impacted, MapNode, PRFile } from "@/lib/types";

export const SIZE = 1000;
export const CENTER = SIZE / 2;
export const CORE = 64;
/** Radius of each ring: 0 holds the changed files, 1–3 the files 1–3 imports away. */
export const RINGS = [150, 238, 318, 392];
export const BAND = 446;
export const LABEL = 482;

const GAP = 0.05;
const MAX_CHANGED = 120;
const TOP = -Math.PI / 2;

export type State = NonNullable<MapNode["state"]>;

export interface RadarNode {
  path: string;
  depth: 0 | 1 | 2 | 3;
  state: State;
  area: string;
  /** For ripple files, the changed file they lead back to. */
  via?: string;
  x: number;
  y: number;
  r: number;
  order: number;
}

export interface RadarSector {
  area: string;
  start: number;
  end: number;
  changed: number;
  impacted: number;
  /** Files in the whole area, affected or not. */
  total: number;
}

export interface RadarLink {
  from: string;
  to: string;
  d: string;
}

export interface Radar {
  nodes: RadarNode[];
  sectors: RadarSector[];
  links: RadarLink[];
  byPath: Map<string, RadarNode>;
}

export function polar(r: number, angle: number): [number, number] {
  return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r];
}

/** An SVG arc path along radius `r`, clockwise from `a` to `b`. */
export function arcPath(r: number, a: number, b: number): string {
  const [x1, y1] = polar(r, a);
  const [x2, y2] = polar(r, b);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Files per area across the whole repository, read off the map the server sent. */
export function areaTotals(map: MapNode): Map<string, number> {
  const totals = new Map<string, number>();
  const visit = (n: MapNode) => {
    if (n.children) {
      n.children.forEach(visit);
      return;
    }
    let area: string;
    if (n.state) area = areaOf(n.path);
    else if (n.path.endsWith("/…")) {
      const dir = n.path.slice(0, -2).replace(/^\//, "");
      area = dir ? areaOf(`${dir}/f`) : ROOT_AREA;
    } else area = areaOf(`${n.path}/f`);
    totals.set(area, (totals.get(area) ?? 0) + (n.files ?? 0));
  };
  visit(map);
  return totals;
}

export function buildRadar(files: PRFile[], impacted: Impacted[], edges: [string, string][], map: MapNode): Radar {
  type Seed = Omit<RadarNode, "x" | "y" | "r" | "order">;
  const changed: Seed[] = [...files]
    .sort((a, b) => b.reach - a.reach || b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, MAX_CHANGED)
    .map((f) => ({
      path: f.path,
      depth: 0,
      state: f.status === "removed" ? "removed" : f.status === "added" ? "added" : "changed",
      area: areaOf(f.path),
    }));
  const ripple: Seed[] = impacted.map((i) => ({
    path: i.path,
    depth: i.depth,
    state: i.depth === 1 ? "ripple1" : i.depth === 2 ? "ripple2" : "ripple3",
    area: areaOf(i.path),
    via: i.via,
  }));
  const seeds = [...changed, ...ripple];

  // Slices are sized by how much of the change lands in them, with a floor so
  // a single file still gets room.
  const perArea = new Map<string, Seed[]>();
  for (const s of seeds) perArea.set(s.area, [...(perArea.get(s.area) ?? []), s]);
  const areas = [...perArea.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const weights = areas.map(([, list]) => Math.sqrt(list.length) + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = Math.PI * 2 - GAP * areas.length;
  const totals = areaTotals(map);

  const sectors: RadarSector[] = [];
  const nodes: RadarNode[] = [];
  let at = TOP + GAP / 2;
  areas.forEach(([area, list], i) => {
    const span = (weights[i] / totalWeight) * usable;
    const sector: RadarSector = {
      area,
      start: at,
      end: at + span,
      changed: list.filter((s) => s.depth === 0).length,
      impacted: list.filter((s) => s.depth > 0).length,
      total: Math.max(totals.get(area) ?? 0, list.length),
    };
    sectors.push(sector);
    for (const depth of [0, 1, 2, 3] as const) {
      const ring = list.filter((s) => s.depth === depth).sort((a, b) => a.path.localeCompare(b.path));
      placeRing(ring, depth, sector, nodes);
    }
    at += span + GAP;
  });

  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const links: RadarLink[] = [];
  for (const [from, to] of edges) {
    const a = byPath.get(from);
    const b = byPath.get(to);
    // Only lines that step one ring inwards, towards the change; links within
    // a ring (files in the same package) would turn the radar into a tangle.
    if (!a || !b || a.depth !== b.depth + 1) continue;
    links.push({ from, to, d: linkPath(a, b) });
  }
  return { nodes, sectors, links, byPath };
}

/** Spreads one ring's files across a slice, stacking them in up to three rows when crowded. */
function placeRing(ring: Omit<RadarNode, "x" | "y" | "r" | "order">[], depth: 0 | 1 | 2 | 3, s: RadarSector, out: RadarNode[]) {
  if (ring.length === 0) return;
  const radius = RINGS[depth];
  const span = s.end - s.start;
  const arcLength = radius * span;
  const ideal = depth === 0 ? 26 : 20;
  const rows = Math.min(3, Math.max(1, Math.ceil((ring.length * ideal) / arcLength)));
  const perRow = Math.ceil(ring.length / rows);
  const step = span / perRow;
  const dot = Math.max(3, Math.min(depth === 0 ? 15 : 11, (radius * step) * 0.36));
  ring.forEach((seed, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const r = radius + (row - (rows - 1) / 2) * dot * 2.4;
    // Odd rows sit half a step over, so stacked dots interleave.
    const angle = s.start + step * (col + 0.5 + (row % 2) * 0.5);
    const [x, y] = polar(r, Math.min(angle, s.end - step * 0.25));
    out.push({ ...seed, x, y, r: dot, order: out.length });
  });
}

/** A curve from a file to the file it imports, bowing towards the centre. */
function linkPath(a: RadarNode, b: RadarNode): string {
  const ax = a.x - CENTER;
  const ay = a.y - CENTER;
  const bx = b.x - CENTER;
  const by = b.y - CENTER;
  const mid = Math.atan2(ay + by, ax + bx);
  const r = (Math.hypot(ax, ay) + Math.hypot(bx, by)) / 2 * 0.72;
  const [cx, cy] = polar(r, mid);
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

/**
 * The files to light up for a focused file: what it imports on the way back
 * to the change, and, for a changed file, everything that imports it.
 */
export function trace(radar: Radar, path: string): Set<string> {
  const out = new Set([path]);
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const l of radar.links) {
    forward.set(l.from, [...(forward.get(l.from) ?? []), l.to]);
    backward.set(l.to, [...(backward.get(l.to) ?? []), l.from]);
  }
  const walk = (start: string, next: Map<string, string[]>) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const n of next.get(cur) ?? []) {
        if (!out.has(n)) {
          out.add(n);
          stack.push(n);
        }
      }
    }
  };
  walk(path, forward);
  if (radar.byPath.get(path)?.depth === 0) walk(path, backward);
  return out;
}
