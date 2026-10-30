import { describe, expect, it } from "vitest";
import { arcs, buildRings, GAP, geometry, hitTest, OTHER, ROOT } from "@/components/rings";
import { folderKey, milestones } from "@/lib/timelapse";
import type { Frame } from "@/lib/types";

function frame(index: number, dirs: Record<string, number>, langs: Record<string, number> = {}): Frame {
  const files = Object.values(dirs).reduce((a, b) => a + b, 0);
  return { sha: `s${index}`, date: "2024-01-01T00:00:00Z", author: "a", message: "m", index, files, bytes: 0, dirs, langs };
}

describe("folderKey", () => {
  it("cuts directories to two levels", () => {
    expect(folderKey("README.md")).toBe("");
    expect(folderKey("a/b/c/d.ts")).toBe("a/b");
    expect(folderKey("a/d.ts")).toBe("a");
  });
});

describe("milestones", () => {
  it("notes new folders, new languages and big jumps", () => {
    const frames = [
      frame(1, { "": 60 }, { Markdown: 60 }),
      frame(2, { "": 60, src: 80 }, { Markdown: 60, Go: 80 }),
      frame(3, { "": 60, src: 20 }, { Markdown: 60, Go: 20 }),
    ];
    const labels = milestones(frames).map((m) => m.label);
    expect(labels).toContain("src/ appears");
    expect(labels).toContain("First Go code");
    expect(labels).toContain("Grows 133%");
    expect(labels.some((l) => l.startsWith("Big clean-up"))).toBe(true);
  });

  it("records what each moment is about, so the history graph can give it a lane", () => {
    const frames = [frame(1, { "": 60 }), frame(2, { "": 60, src: 10, docs: 5 }, { Go: 10 })];
    expect(milestones(frames)).toEqual([
      { frame: 1, label: "src/ appears", kind: "folder", key: "src" },
      { frame: 1, label: "docs/ appears", kind: "folder", key: "docs" },
      { frame: 1, label: "First Go code", kind: "language", key: "Go" },
    ]);
  });
});

describe("growth rings", () => {
  const frames = [frame(1, { "": 2, src: 6 }), frame(2, { "": 2, src: 3, "src/lib": 5, docs: 10 })];
  const model = buildRings(frames);

  it("folds sub-folders into their top-level folder and keeps root files apart", () => {
    expect(model.folders.map((f) => f.key)).toEqual(["docs", "src", ROOT]);
    expect(model.counts).toEqual([
      [0, 6, 2],
      [10, 8, 2],
    ]);
    expect(model.totals).toEqual([8, 20]);
  });

  it("gives each folder the same colour on every ring, and folds the long tail into one bucket", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 14; i++) many[`f${String(i).padStart(2, "0")}`] = 20 - i;
    const m = buildRings([frame(1, many)]);
    expect(m.folders).toHaveLength(10);
    expect(m.folders[9]).toMatchObject({ key: OTHER, label: "5 more folders" });
    expect(new Set(m.folders.slice(0, 9).map((f) => f.color)).size).toBe(9);
    expect(m.totals[0]).toBe(Object.values(many).reduce((a, b) => a + b, 0));
  });

  it("splits a ring in proportion, leaving a small gap between arcs", () => {
    const a = arcs([10, 0, 30]);
    expect(a.map((x) => x.folder)).toEqual([0, 2]);
    const sweep = (x: { start: number; end: number }) => x.end - x.start;
    expect(sweep(a[1]) / sweep(a[0])).toBeCloseTo(3);
    expect(a[1].start - a[0].end).toBeCloseTo(GAP);
    expect(arcs([5])[0].end - arcs([5])[0].start).toBeCloseTo(Math.PI * 2);
  });

  it("finds the ring and folder under the pointer", () => {
    const g = geometry(400, 400, frames.length);
    // Straight up from the centre is where every ring starts, in the first folder that has files.
    const upInRing = (ring: number) => hitTest(model, g, 2, g.cx, g.cy - (g.inner + g.band * (ring + 0.5)));
    expect(upInRing(0)).toEqual({ frame: 0, folder: 1 });
    expect(upInRing(1)).toEqual({ frame: 1, folder: 0 });
    expect(hitTest(model, g, 2, g.cx, g.cy)).toBeNull();
    expect(hitTest(model, g, 1, g.cx, g.cy - (g.inner + g.band * 1.5))).toBeNull();
  });
});
