// The gitblast mark: growth rings in the site's folder colours (the
// time-lapse) around an orange blast core (the pull request radar).

export const MARK_PATHS = {
  outer: [
    { d: "M32 6A26 26 0 0 1 51.92 48.71", color: "#0071e3" },
    { d: "M45.78 54.05A26 26 0 0 1 7.57 40.89", color: "#7d3cf2" },
    { d: "M6.02 32.91A26 26 0 0 1 23.97 7.27", color: "#0fa3b1" },
  ],
  inner: [
    { d: "M32 15A17 17 0 1 1 26.19 47.97", color: "#0071e3" },
    { d: "M21.53 45.4A17 17 0 0 1 26.75 15.83", color: "#7d3cf2" },
  ],
};

/** The name: "git" in light code type, "blast" in the bold blast gradient. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`.trim()} aria-label="gitblast">
      <span className="wordmark-git" aria-hidden="true">git</span>
      <span className="wordmark-blast" aria-hidden="true">blast</span>
    </span>
  );
}

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="gb-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9500" />
          <stop offset="0.55" stopColor="#ff3b30" />
          <stop offset="1" stopColor="#ff2d55" />
        </linearGradient>
      </defs>
      {MARK_PATHS.outer.map((p) => (
        <path key={p.d} d={p.d} fill="none" stroke={p.color} strokeWidth="6" strokeLinecap="round" />
      ))}
      {MARK_PATHS.inner.map((p) => (
        <path key={p.d} d={p.d} fill="none" stroke={p.color} strokeWidth="6" strokeLinecap="round" opacity="0.55" />
      ))}
      <circle cx="32" cy="32" r="8" fill="url(#gb-core)" />
    </svg>
  );
}

/** The mark as a standalone SVG data URI, for generated images (social cards, app icons). */
export function markDataUri(): string {
  const arcs = [
    ...MARK_PATHS.outer.map((p) => `<path d="${p.d}" stroke="${p.color}"/>`),
    ...MARK_PATHS.inner.map((p) => `<path d="${p.d}" stroke="${p.color}" opacity=".55"/>`),
  ].join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9500"/>` +
    `<stop offset=".55" stop-color="#ff3b30"/><stop offset="1" stop-color="#ff2d55"/></linearGradient></defs>` +
    `<g fill="none" stroke-width="6" stroke-linecap="round">${arcs}</g><circle cx="32" cy="32" r="8" fill="url(#c)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
