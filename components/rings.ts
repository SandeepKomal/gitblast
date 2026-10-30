// The time-lapse as growth rings: one ring per sampled commit, from the first
// commit at the centre to today on the outside. Each ring is split into arcs,
// one per top-level folder, sized by that folder's share of the files then.

import type { Frame } from "@/lib/types";

/** Key for loose files in the repository root. */
export const ROOT = "";
/** Key for the folders folded together once there are too many to tell apart. */
export const OTHER = "\u0000other";

export interface RingFolder {
  key: string;
  label: string;
  color: string;
}

export interface RingModel {
  folders: RingFolder[];
  /** counts[frame][folder]: files in that folder at that frame. */
  counts: number[][];
  totals: number[];
}

/**
 * One family of rich, distinct hues, ordered so neighbouring arcs contrast.
 * Loose root files and the "other" bucket stay neutral.
 */
export const PALETTE = ["#0071e3", "#7d3cf2", "#0fa3b1", "#e8590c", "#d6336c", "#2f9e44", "#5c7cfa", "#f08c00", "#ae3ec9"];
const ROOT_COLOR = "#8b95a8";
const OTHER_COLOR = "#c3c8d1";
const MAX_FOLDERS = PALETTE.length;

export function topFolder(dir: string): string {
  return dir === "" ? ROOT : dir.split("/")[0];
}

export function buildRings(frames: Frame[]): RingModel {
  const perFrame = frames.map((f) => {
    const m = new Map<string, number>();
    for (const [dir, n] of Object.entries(f.dirs)) {
      const top = topFolder(dir);
      m.set(top, (m.get(top) ?? 0) + n);
    }
    return m;
  });

  // Order folders by size today, then by their largest size ever, so the
  // biggest ones keep the same place and colour on every ring.
  const last = perFrame[perFrame.length - 1] ?? new Map<string, number>();
  const peak = new Map<string, number>();
  for (const m of perFrame) for (const [k, n] of m) peak.set(k, Math.max(peak.get(k) ?? 0, n));
  const ordered = [...peak.keys()]
    .filter((k) => k !== ROOT)
    .sort((a, b) => (last.get(b) ?? 0) - (last.get(a) ?? 0) || (peak.get(b) ?? 0) - (peak.get(a) ?? 0) || a.localeCompare(b));

  const named = ordered.slice(0, MAX_FOLDERS);
  const folded = new Set(ordered.slice(MAX_FOLDERS));
  const folders: RingFolder[] = named.map((key, i) => ({ key, label: `${key}/`, color: PALETTE[i] }));
  if (peak.has(ROOT)) folders.push({ key: ROOT, label: "Root files", color: ROOT_COLOR });
  if (folded.size > 0) folders.push({ key: OTHER, label: `${folded.size} more folders`, color: OTHER_COLOR });

  const index = new Map(folders.map((f, i) => [f.key, i]));
  const counts = perFrame.map((m) => {
    const row = new Array<number>(folders.length).fill(0);
    for (const [k, n] of m) row[index.get(folded.has(k) ? OTHER : k) ?? 0] += n;
    return row;
  });
  return { folders, counts, totals: counts.map((row) => row.reduce((a, b) => a + b, 0)) };
}

export interface Geometry {
  cx: number;
  cy: number;
  /** Radius of the empty centre. */
  inner: number;
  outer: number;
  /** Radial space per ring, including the gap. */
  band: number;
}

export function geometry(w: number, h: number, rings: number): Geometry {
  const outer = Math.max(40, Math.min(w * 0.5, h * 0.5) - 18);
  const inner = outer * 0.34;
  return { cx: w / 2, cy: h / 2, inner, outer, band: (outer - inner) / Math.max(1, rings) };
}

const START = -Math.PI / 2;
/** Angle left empty between neighbouring arcs. */
export const GAP = 0.014;

export interface Arc {
  folder: number;
  start: number;
  end: number;
}

/** The arcs of one ring, clockwise from twelve o'clock. Empty folders get no arc. */
export function arcs(counts: number[]): Arc[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const present = counts.filter((n) => n > 0).length;
  if (total === 0) return [];
  const usable = Math.PI * 2 - (present > 1 ? GAP * present : 0);
  const out: Arc[] = [];
  let at = START;
  counts.forEach((n, folder) => {
    if (n === 0) return;
    const sweep = (n / total) * usable;
    out.push({ folder, start: at, end: at + sweep });
    at += sweep + (present > 1 ? GAP : 0);
  });
  return out;
}

/** Which ring and folder sit under a point, if any. */
export function hitTest(
  model: RingModel,
  g: Geometry,
  shownRings: number,
  x: number,
  y: number,
): { frame: number; folder: number } | null {
  const dx = x - g.cx;
  const dy = y - g.cy;
  const r = Math.hypot(dx, dy);
  if (r < g.inner || r > g.inner + g.band * shownRings) return null;
  const frame = Math.min(shownRings - 1, Math.floor((r - g.inner) / g.band));
  let angle = Math.atan2(dy, dx);
  while (angle < START) angle += Math.PI * 2;
  const arc = arcs(model.counts[frame]).find((a) => angle >= a.start && angle <= a.end);
  return arc ? { frame, folder: arc.folder } : null;
}
