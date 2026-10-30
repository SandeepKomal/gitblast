"use client";

import type { ReactNode } from "react";

// A list drawn like a git graph: a root dot, a grey trunk running down the
// left, and coloured lanes that branch off the root and run alongside the rows
// that belong to them.

export interface GraphRow {
  key: string;
  /** 0 is the trunk; 1 and up index into `lanes`. */
  lane: number;
  label: ReactNode;
  title?: string;
  tag?: string;
  meta?: ReactNode;
  /** Dot colour, when it differs from the lane's colour. */
  dot?: string;
  /** Highlighted rows get a tinted band and full-strength text. */
  lit?: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
}

const ROW = 40;
const GAP = 20;
const X0 = 12;
const TRUNK = "var(--graph-trunk)";

export function GraphList({
  root,
  lanes,
  rows,
  progress,
}: {
  root: { label: ReactNode; color: string; meta?: ReactNode };
  /** Colours of lanes 1, 2, 3… */
  lanes: string[];
  rows: GraphRow[];
  /** When set, a coloured line fills the trunk down to this many rows, like a playhead. */
  progress?: number;
}) {
  const used = Math.max(0, ...rows.map((r) => r.lane));
  const gutter = X0 + used * GAP + 16;
  const height = (rows.length + 1) * ROW;
  const y = (i: number) => (i + 0.5) * ROW;
  const x = (lane: number) => X0 + lane * GAP;
  const color = (lane: number) => (lane === 0 ? TRUNK : lanes[lane - 1] ?? TRUNK);

  const branches: { lane: number; last: number }[] = [];
  for (let lane = 1; lane <= used; lane++) {
    let last = -1;
    rows.forEach((r, i) => r.lane === lane && (last = i + 1));
    if (last > 0) branches.push({ lane, last });
  }

  return (
    <div className="graph" style={{ ["--gutter" as string]: `${gutter}px` }}>
      <svg className="graph-lines" width={gutter} height={height} aria-hidden="true">
        {rows.length > 0 && (
          <path d={`M ${x(0)} ${y(0)} V ${y(rows.length)}`} pathLength={1} style={{ stroke: TRUNK }} />
        )}
        {branches.map(({ lane, last }) => (
          <path
            key={lane}
            d={`M ${x(0)} ${y(0)} C ${x(lane)} ${y(0)}, ${x(lane)} ${y(0)}, ${x(lane)} ${y(0) + 18} V ${y(last)}`}
            pathLength={1}
            style={{ stroke: color(lane), animationDelay: `${lane * 90}ms` }}
          />
        ))}
        {progress !== undefined && rows.length > 0 && (
          <rect
            className="graph-progress"
            x={x(0) - 1.5}
            y={y(0)}
            width={3}
            rx={1.5}
            height={y(rows.length) - y(0)}
            style={{ fill: root.color, transform: `scaleY(${Math.min(1, progress / rows.length)})` }}
          />
        )}
        <circle className="graph-dot root" cx={x(0)} cy={y(0)} r={7} style={{ fill: root.color }} />
        {rows.map((r, i) => (
          <circle
            key={r.key}
            className="graph-dot"
            cx={x(r.lane)}
            cy={y(i + 1)}
            r={4.5}
            style={{ fill: r.dot ?? color(r.lane), animationDelay: `${120 + i * 35}ms` }}
          />
        ))}
        {/* A ring that pings once when a row lights up; it remounts each time. */}
        {progress !== undefined &&
          rows.map((r, i) =>
            r.lit ? (
              <circle
                key={`${r.key}-ping`}
                className="graph-ping"
                cx={x(r.lane)}
                cy={y(i + 1)}
                r={4.5}
                style={{ stroke: r.dot ?? color(r.lane) }}
              />
            ) : null,
          )}
      </svg>

      <div className="graph-row graph-root">
        <span className="graph-label">{root.label}</span>
        {root.meta && <span className="graph-meta">{root.meta}</span>}
      </div>
      {rows.map((r) => {
        const tint = color(r.lane);
        const body = (
          <>
            <span className="graph-label" title={r.title}>
              {r.label}
            </span>
            {r.tag && (
              <span className="graph-tag" style={{ ["--tag" as string]: r.lane === 0 ? (r.dot ?? TRUNK) : tint }}>
                {r.tag}
              </span>
            )}
            {r.meta && <span className="graph-meta">{r.meta}</span>}
          </>
        );
        const props = {
          className: `graph-row${r.lit ? " lit" : ""}`,
          style: { ["--band" as string]: tint },
          onMouseEnter: r.onHover && (() => r.onHover?.(true)),
          onMouseLeave: r.onHover && (() => r.onHover?.(false)),
        };
        return r.onClick ? (
          <button key={r.key} type="button" {...props} onClick={r.onClick}>
            {body}
          </button>
        ) : (
          <div key={r.key} {...props}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
