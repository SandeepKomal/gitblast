import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/Logo";
import { parseSegments } from "@/lib/route";

const size = { width: 1200, height: 630 };

// Geist, the site's own typeface (SIL Open Font License, see assets/fonts/OFL.txt).
const fontDir = join(process.cwd(), "assets/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "Geist-Regular.ttf")),
  readFile(join(fontDir, "Geist-Bold.ttf")),
  readFile(join(fontDir, "GeistMono-Light.ttf")),
]).then(([regular, bold, mono]) => [
  { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
  { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  { name: "Geist Mono", data: mono, weight: 300 as const, style: "normal" as const },
]);

// The social preview card. It only uses the path, so it never calls GitHub.
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const route = parseSegments(path.split("/"));
  const name = route ? `${route.owner}/${route.repo}` : "gitblast";
  const kicker = route?.kind === "pr" ? `Pull request #${route.number}` : "Repository time-lapse";
  const line = route?.kind === "pr" ? "What it changes, what imports it, what to review first." : "Watch it grow from the first commit to today.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#fbfbfd",
          color: "#1d1d1f",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 38 }}>
          <img src={markDataUri()} width={48} height={48} alt="" style={{ marginRight: 16 }} />
          <span style={{ fontFamily: "Geist Mono", fontWeight: 300, color: "#86868b", letterSpacing: -1 }}>git</span>
          <span
            style={{
              fontWeight: 700,
              letterSpacing: -1.5,
              backgroundImage: "linear-gradient(90deg,#ff9500,#ff3b30,#ff2d55)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            blast
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              backgroundImage: "linear-gradient(90deg,#ff9500,#ff3b30,#ff2d55)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {kicker}
          </div>
          <div style={{ fontSize: name.length > 34 ? 52 : name.length > 22 ? 64 : 84, fontWeight: 700, letterSpacing: -3 }}>{name}</div>
          <div style={{ fontSize: 32, color: "#6e6e73" }}>{line}</div>
        </div>
      </div>
    ),
    { ...size, fonts: await fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable" } },
  );
}
