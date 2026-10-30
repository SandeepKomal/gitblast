"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { bytes, compact, day, monthYear, num } from "@/lib/format";
import type { Frame, PullSummary, Timelapse } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { CopyLink } from "./CopyLink";
import { GraphList, type GraphRow } from "./GraphList";
import { ErrorState, Loading } from "./States";
import { arcs, buildRings, geometry, hitTest, OTHER, ROOT, type RingModel } from "./rings";

const SPEEDS = [0.5, 1, 2, 4];
const NEUTRAL = "#a1a1a6";
const FRAME_MS = 900;

export function TimelapseView({ owner, repo }: { owner: string; repo: string }) {
  const q = `owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
  const state = useApi<Timelapse>(`/api/timelapse?${q}`);
  if (state.status === "loading") {
    return (
      <Loading
        title={`Rewinding ${owner}/${repo}`}
        hint="Sampling its history from the first commit to today. Repositories with long histories take a little longer."
        elapsed={state.elapsed}
      />
    );
  }
  if (state.status === "error") return <ErrorState error={state.error} githubUrl={`https://github.com/${owner}/${repo}`} />;
  return <Player data={state.data} />;
}

function Player({ data }: { data: Timelapse }) {
  const { repo, frames } = data;
  const model = useMemo(() => buildRings(frames), [frames]);
  const colors = useMemo(() => new Map(model.folders.map((f) => [f.key, f.color])), [model]);
  const last = Math.max(0, frames.length - 1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  // The folder to single out: the one under the pointer, else the pinned one.
  const focusRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  focusRef.current = hovered ?? pinned;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tip, setTip] = useState<{ x: number; y: number; frame: number; folder: number } | null>(null);

  const current = frames[Math.min(last, Math.round(t))];

  function seek(v: number) {
    tRef.current = Math.max(0, Math.min(last, v));
    setT(tRef.current);
  }
  function play(on: boolean) {
    if (on && tRef.current >= last) seek(0);
    playingRef.current = on;
    setPlaying(on);
  }

  // Start playing once, unless the viewer prefers less motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || last === 0) {
      seek(last);
    } else {
      const id = setTimeout(() => play(true), 450);
      return () => clearTimeout(id);
    }
    // Runs once per data set; play and seek only touch refs and setters.
  }, [data]);

  // Drawing loop. It runs every animation frame but hands React a coarser
  // position, so the panels re-render about twenty times a second at most.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Colours come from the page's theme tokens and follow light and dark mode.
    const theme = { font: "", surface: "", track: "", text: "", muted: "", dark: false };
    const readTheme = () => {
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      theme.font = v("--font-display") || "system-ui";
      theme.surface = v("--surface") || "#ffffff";
      theme.track = v("--fill") || "#e8e8ed";
      theme.text = v("--text");
      theme.muted = v("--muted");
      theme.dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    readTheme();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", readTheme);
    let raf = 0;
    let prev = performance.now();
    let shown = -1;

    const draw = (now: number) => {
      const dt = now - prev;
      prev = now;
      if (playingRef.current) {
        tRef.current = Math.min(last, tRef.current + (dt / FRAME_MS) * speedRef.current);
        const coarse = Math.round(tRef.current * 20) / 20;
        if (coarse !== shown) {
          shown = coarse;
          setT(coarse);
        }
        if (tRef.current >= last) {
          playingRef.current = false;
          setPlaying(false);
        }
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRings(ctx, model, geometry(w, h, frames.length), tRef.current, focusRef.current, theme);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      scheme.removeEventListener("change", readTheme);
    };
  }, [model, frames.length, last]);

  // Keyboard: space plays or pauses, arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === " ") {
        e.preventDefault();
        play(!playingRef.current);
      } else if (e.key === "ArrowRight") {
        play(false);
        seek(Math.floor(tRef.current) + 1);
      } else if (e.key === "ArrowLeft") {
        play(false);
        seek(Math.ceil(tRef.current) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  function pointAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const shownRings = Math.min(frames.length, Math.floor(tRef.current) + 1);
    return { x, y, hit: hitTest(model, geometry(box.width, box.height, frames.length), shownRings, x, y) };
  }

  function hover(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y, hit } = pointAt(e);
    setTip(hit ? { x, y, ...hit } : null);
    setHovered(hit ? hit.folder : null);
  }

  const tops = useMemo(() => countFolders(current), [current]);

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          {repo.avatar && <img className="avatar" src={repo.avatar} alt="" width={20} height={20} referrerPolicy="no-referrer" />}
          <span>{repo.owner}</span>
          <span className="sep">/</span>
          <b style={{ color: "var(--text)", fontWeight: 600 }}>{repo.repo}</b>
        </div>
        <h1 className="page-title">How {repo.repo} grew</h1>
        <div className="meta-row">
          {repo.description && <span style={{ flexBasis: "100%", color: "var(--muted)" }}>{repo.description}</span>}
          <span>★ {compact(repo.stars)}</span>
          <span>{compact(repo.forks)} forks</span>
          {repo.language && <span>{repo.language}</span>}
          {repo.license && <span>{repo.license}</span>}
          <span>{num(data.totalCommits)} commits since {monthYear(repo.createdAt)}</span>
          <span className="head-actions">
            <CopyLink />
            <a className="btn btn-primary btn-sm" href={`https://github.com/${repo.owner}/${repo.repo}`} target="_blank" rel="noopener noreferrer">
              Open on GitHub ↗
            </a>
          </span>
        </div>
      </header>

      {data.partial && (
        <div className="notice" role="note">
          <span aria-hidden="true">⚠</span>
          <span>Some points in this history were too large to read in full, so a few frames are approximate.</span>
        </div>
      )}

      <section className="tl-grid">
        <div className="card stage">
          <canvas
            ref={canvasRef}
            onMouseMove={hover}
            onMouseLeave={() => {
              setTip(null);
              setHovered(null);
            }}
            onClick={(e) => {
              const { hit } = pointAt(e);
              if (!hit) return;
              play(false);
              seek(hit.frame);
            }}
            style={{ cursor: tip ? "pointer" : "default" }}
            aria-label={`Growth rings of ${repo.repo}: one ring per point in its history, split by top-level folder`}
            role="img"
          />
          {current && (
            <div className="stage-caption">
              <div>
                <div className="stage-date">{monthYear(current.date)}</div>
                <div className="stage-sub">
                  commit {num(current.index)} of {num(data.totalCommits)}
                </div>
              </div>
              <div className="stage-commit">
                <div className="msg">{current.message}</div>
                <div className="by">
                  {current.avatar && <img className="avatar" src={current.avatar} alt="" width={16} height={16} referrerPolicy="no-referrer" />}
                  {current.author}
                  <span className="sha">
                    · <span className="mono">{current.sha.slice(0, 7)}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
          {tip && <RingTip model={model} frames={frames} tip={tip} />}
          <Legend
            model={model}
            frame={Math.min(last, Math.round(t))}
            focus={hovered ?? pinned}
            pinned={pinned}
            onHover={setHovered}
            onPin={(i) => setPinned(pinned === i ? null : i)}
          />
          <div className="controls">
            <button className="btn btn-ghost btn-icon" onClick={() => play(!playing)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <Scrubber t={t} last={last} milestones={data.milestones} onSeek={(v) => { play(false); seek(v); }} />
            <button
              className="btn btn-ghost speed"
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                speedRef.current = next;
                setSpeed(next);
              }}
              aria-label="Playback speed"
            >
              {speed}×
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h2>At this point</h2>
            <div className="counter-grid">
              <div className="stat"><div className="v">{num(current?.files ?? 0)}</div><div className="k">files</div></div>
              <div className="stat"><div className="v">{bytes(current?.bytes ?? 0)}</div><div className="k">of code and assets</div></div>
              <div className="stat"><div className="v">{num(tops)}</div><div className="k">top-level folders</div></div>
              <div className="stat"><div className="v">{day(current?.date ?? "")}</div><div className="k">date</div></div>
            </div>
          </div>
          {current && <Languages frame={current} colors={data.langColors} />}
          {data.milestones.length > 0 && (
            <History
              data={data}
              colors={colors}
              t={t}
              onSeek={(frame) => {
                play(false);
                seek(frame);
              }}
            />
          )}
          {data.contributors.length > 0 && (
            <div className="card card-pad">
              <h2>Top contributors</h2>
              <div className="people">
                {data.contributors.map((c) => (
                  <a key={c.login} href={`https://github.com/${c.login}`} target="_blank" rel="noopener noreferrer" title={`${c.login} · ${num(c.contributions)} commits`}>
                    <img className="avatar" src={c.avatar} alt={c.login} width={36} height={36} referrerPolicy="no-referrer" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <PullRequests owner={repo.owner} repo={repo.repo} />
    </>
  );
}

/** Draws the rings up to position `t`, sweeping the newest ring in like a clock hand. */
function drawRings(
  ctx: CanvasRenderingContext2D,
  model: RingModel,
  g: ReturnType<typeof geometry>,
  t: number,
  focus: number | null,
  theme: { font: string; surface: string; track: string; text: string; muted: string; dark: boolean },
) {
  const done = Math.floor(t);
  const raw = t - done;
  const sweep = raw * raw * (3 - 2 * raw);
  // Thin rings need less of a gap, or many of them turn into stripes.
  const thick = g.band * (model.counts.length > 20 ? 0.9 : 0.78);
  const TOP = -Math.PI / 2;

  // Faint tracks show where the rings still to come will go.
  ctx.lineCap = "butt";
  for (let i = done + 1; i < model.counts.length; i++) {
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.inner + g.band * (i + 0.5), 0, Math.PI * 2);
    ctx.strokeStyle = theme.track;
    ctx.globalAlpha = theme.dark ? 0.9 : 0.45;
    ctx.lineWidth = thick;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const ringCount = Math.min(model.counts.length, done + (sweep > 0 ? 2 : 1));
  for (let i = 0; i < ringCount; i++) {
    const r = g.inner + g.band * (i + 0.5);
    const limit = i <= done ? Infinity : TOP + sweep * Math.PI * 2;
    // Older rings are paler, so the newest one reads first.
    const age = done === 0 ? 0 : Math.max(0, (done - i) / done);
    for (const a of arcs(model.counts[i])) {
      if (a.start >= limit) break;
      // On a dark background, lift each colour a little and fade old rings
      // less, or they sink into the page.
      const base = model.folders[a.folder].color;
      const color = theme.dark ? mix(base, "#ffffff", 0.18) : base;
      const faded = focus === null ? mix(color, theme.surface, age * (theme.dark ? 0.32 : 0.55)) : color;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, r, a.start, Math.min(a.end, limit));
      ctx.strokeStyle = faded;
      ctx.globalAlpha = focus === null || focus === a.folder ? 1 : theme.dark ? 0.22 : 0.13;
      ctx.lineWidth = thick;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The leading edge of the ring being drawn.
  if (sweep > 0 && done + 1 < model.counts.length) {
    const r = g.inner + g.band * (done + 1.5);
    const angle = TOP + sweep * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(g.cx + Math.cos(angle) * r, g.cy + Math.sin(angle) * r, Math.max(3, thick * 0.55), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 113, 227, 0.8)";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // The count in the middle, like a watch face.
  const frame = Math.min(model.totals.length - 1, Math.round(t));
  const files = focus === null ? model.totals[frame] : model.counts[frame][focus];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = focus === null ? theme.text : model.folders[focus].color;
  ctx.font = `700 ${Math.round(g.inner * 0.42)}px ${theme.font}`;
  ctx.fillText((files ?? 0).toLocaleString("en-US"), g.cx, g.cy - g.inner * 0.08);
  ctx.fillStyle = theme.muted;
  ctx.font = `500 ${Math.max(11, Math.round(g.inner * 0.13))}px ${theme.font}`;
  ctx.fillText(focus === null ? "files" : `files in ${model.folders[focus].label}`, g.cx, g.cy + g.inner * 0.3);
  ctx.textBaseline = "alphabetic";
}

function RingTip({
  model,
  frames,
  tip,
}: {
  model: RingModel;
  frames: Frame[];
  tip: { x: number; y: number; frame: number; folder: number };
}) {
  const folder = model.folders[tip.folder];
  const n = model.counts[tip.frame][tip.folder];
  const before = tip.frame > 0 ? model.counts[tip.frame - 1][tip.folder] : 0;
  const share = model.totals[tip.frame] ? Math.round((n / model.totals[tip.frame]) * 100) : 0;
  const subs: [string, number][] = [];
  if (folder.key !== ROOT && folder.key !== OTHER) {
    const m = new Map<string, number>();
    for (const [dir, c] of Object.entries(frames[tip.frame].dirs)) {
      const parts = dir.split("/");
      if (parts[0] !== folder.key || parts.length < 2) continue;
      m.set(parts[1], (m.get(parts[1]) ?? 0) + c);
    }
    subs.push(...[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));
  }
  return (
    <div className={`tooltip ring-tip${tip.y < 130 ? " below" : ""}`} style={{ left: tip.x, top: tip.y }}>
      <div className="ring-tip-head">
        <i className="dot" style={{ background: folder.color }} />
        <b>{folder.label}</b>
        <span className="faint">{monthYear(frames[tip.frame].date)}</span>
      </div>
      <div className="s">
        {num(n)} files · {share}% of the repository
        {tip.frame > 0 && n !== before && (
          <span className={n > before ? "plus" : "minus"}> · {n > before ? "+" : "−"}{num(Math.abs(n - before))}</span>
        )}
      </div>
      {subs.length > 0 && (
        <div className="ring-tip-subs">
          {subs.map(([name, c]) => (
            <span key={name}>
              {name}/ <span className="faint">{num(c)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({
  model,
  frame,
  focus,
  pinned,
  onHover,
  onPin,
}: {
  model: RingModel;
  frame: number;
  focus: number | null;
  pinned: number | null;
  onHover: (i: number | null) => void;
  onPin: (i: number) => void;
}) {
  return (
    <div className="ring-legend" onMouseLeave={() => onHover(null)}>
      {model.folders.map((f, i) => {
        const n = model.counts[frame][i];
        const before = frame > 0 ? model.counts[frame - 1][i] : n;
        return (
          <button
            key={f.key}
            type="button"
            className={`ring-chip${focus === i ? " on" : ""}${focus !== null && focus !== i ? " dim" : ""}`}
            style={{ ["--chip" as string]: f.color }}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPin(i)}
            aria-pressed={pinned === i}
          >
            <i className="dot" style={{ background: f.color }} />
            <span className="ring-chip-name">{f.label}</span>
            <span className="ring-chip-n">{num(n)}</span>
            {n > before && <span className="plus ring-chip-d">+{num(n - before)}</span>}
          </button>
        );
      })}
    </div>
  );
}

const MAX_FOLDER_LANES = 3;
const LANGUAGE_LANE = "#bf5af2";

/**
 * The milestones as a git graph: each new top-level folder branches off on a
 * lane in the colour it has on the map, languages share a lane, and changes in
 * size stay on the trunk. Moments already reached are lit.
 */
function History({
  data,
  colors,
  t,
  onSeek,
}: {
  data: Timelapse;
  colors: Map<string, string>;
  t: number;
  onSeek: (frame: number) => void;
}) {
  const { milestones, frames } = data;
  const lanes: string[] = [];
  const laneOf = new Map<string, number>();
  for (const m of milestones) {
    if (m.kind !== "folder" || !m.key || laneOf.has(m.key) || laneOf.size >= MAX_FOLDER_LANES) continue;
    lanes.push(colors.get(m.key) ?? NEUTRAL);
    laneOf.set(m.key, lanes.length);
  }
  let languageLane = 0;
  if (milestones.some((m) => m.kind === "language")) {
    lanes.push(LANGUAGE_LANE);
    languageLane = lanes.length;
  }

  const rows: GraphRow[] = milestones.map((m, i) => {
    const folderLane = m.kind === "folder" && m.key ? (laneOf.get(m.key) ?? 0) : 0;
    const lane = m.kind === "language" ? languageLane : folderLane;
    return {
      key: `${i}-${m.label}`,
      lane,
      label: m.label,
      tag: m.kind === "folder" ? "folder" : m.kind === "language" ? "language" : "size",
      dot: m.kind === "language" && m.key ? data.langColors[m.key] : m.kind === "folder" && m.key ? colors.get(m.key) : undefined,
      meta: monthYear(frames[m.frame]?.date ?? ""),
      lit: m.frame <= t,
      onClick: () => onSeek(m.frame),
    };
  });

  return (
    <div className="card card-pad">
      <h2>History</h2>
      <GraphList
        root={{ label: "First commit", color: "#34c759", meta: monthYear(frames[0]?.date ?? "") }}
        lanes={lanes}
        rows={rows}
        progress={rows.filter((r) => r.lit).length}
      />
    </div>
  );
}

function Scrubber({
  t,
  last,
  milestones,
  onSeek,
}: {
  t: number;
  last: number;
  milestones: Timelapse["milestones"];
  onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = last === 0 ? 100 : (t / last) * 100;

  function at(e: ReactPointerEvent<HTMLDivElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onSeek(((e.clientX - box.left) / box.width) * last);
  }

  return (
    <div
      ref={ref}
      className="scrubber"
      role="slider"
      tabIndex={0}
      aria-label="Position in history"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={Math.round(t)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && at(e)}
    >
      <div className="track" />
      <div className="fill" style={{ width: `${pct}%` }} />
      {milestones.map((m, i) => (
        <span key={i} className="tick" style={{ left: `${last === 0 ? 0 : (m.frame / last) * 100}%` }} />
      ))}
      <div className="knob" style={{ left: `${pct}%` }} />
    </div>
  );
}

function Languages({ frame, colors }: { frame: Frame; colors: Record<string, string> }) {
  const entries = Object.entries(frame.langs).filter(([name]) => name !== "Other" && name !== "Image");
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) top.push(["Everything else", rest]);
  return (
    <div className="card card-pad">
      <h2>Languages</h2>
      <div className="langbar">
        {top.map(([name, n]) => (
          <span key={name} style={{ flexGrow: n, background: colors[name] ?? "#52525b" }} title={name} />
        ))}
      </div>
      <div className="lang-list">
        {top.map(([name, n]) => (
          <div key={name}>
            <i className="dot" style={{ background: colors[name] ?? "#52525b" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span className="pct">{((n / total) * 100).toFixed(n / total < 0.1 ? 1 : 0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PullRequests({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const state = useApi<PullSummary[]>(`/api/pulls?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
  const [n, setN] = useState("");

  function jump(e: FormEvent) {
    e.preventDefault();
    const v = Number(n.replace(/^#/, ""));
    if (Number.isInteger(v) && v > 0) router.push(`/${owner}/${repo}/pull/${v}`);
  }

  return (
    <section className="section" style={{ marginTop: 48 }}>
      <div className="card card-pad">
        <h2>See the blast radius of a pull request</h2>
        {state.status === "loading" && <p className="faint" style={{ margin: 0 }}>Loading open pull requests…</p>}
        {state.status === "error" && <p className="faint" style={{ margin: 0 }}>Couldn&apos;t load open pull requests.</p>}
        {state.status === "ready" && state.data.length === 0 && <p className="faint" style={{ margin: 0 }}>No open pull requests right now.</p>}
        {state.status === "ready" && state.data.length > 0 && (
          <ul className="pulls">
            {state.data.map((p) => (
              <li key={p.number}>
                <Link href={`/${owner}/${repo}/pull/${p.number}`}>
                  {p.avatar ? <img className="avatar" src={p.avatar} alt="" width={22} height={22} referrerPolicy="no-referrer" /> : <span />}
                  <span className="t">
                    <span className="faint mono">#{p.number}</span> {p.title}
                    {p.draft && <span className="pill" style={{ marginLeft: 8 }}>Draft</span>}
                  </span>
                  <span className="go chev">Show blast radius</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form className="pr-jump" onSubmit={jump}>
          <div className="urlbox compact" style={{ flex: 1, maxWidth: 320 }}>
            <label htmlFor="pr-number" className="sr-only">Pull request number</label>
            <input id="pr-number" value={n} onChange={(e) => setN(e.target.value)} placeholder="Any PR number, e.g. 1234" inputMode="numeric" />
            <button type="submit" className="btn btn-primary btn-sm">Go</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function countFolders(f: Frame | undefined): number {
  if (!f) return 0;
  return new Set(Object.keys(f.dirs).map((d) => d.split("/")[0]).filter(Boolean)).size;
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Blends `hex` towards `target` by `t` (0–1), returning a hex colour. */
function mix(hex: string, target: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(target);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
      <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}
