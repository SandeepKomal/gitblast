import { describe, expect, it } from "vitest";
import { areaTotals, buildRadar, CENTER, RINGS, trace } from "@/components/radar";
import type { Impacted, MapNode, PRFile } from "@/lib/types";

function file(path: string, reach = 0, status: PRFile["status"] = "modified"): PRFile {
  return { path, status, additions: 1, deletions: 1, role: "source", lang: "Go", color: "#000", usedBy: 0, reach };
}

const map: MapNode = {
  name: "/",
  path: "",
  children: [
    {
      name: "internal",
      path: "internal",
      children: [
        { name: "shell", path: "internal/shell", children: [
          { name: "shell.go", path: "internal/shell/shell.go", value: 1, files: 1, state: "changed" },
          { name: "other files", path: "internal/shell/…", value: 3, files: 3 },
        ] },
        { name: "analyze", path: "internal/analyze", children: [
          { name: "a.go", path: "internal/analyze/a.go", value: 1, files: 1, state: "ripple1" },
        ] },
        { name: "render", path: "internal/render", value: 6, files: 6 },
      ],
    },
    { name: "main.go", path: "main.go", value: 1, files: 1, state: "ripple2" },
    { name: "other files", path: "/…", value: 4, files: 4 },
  ],
};

const files = [file("internal/shell/shell.go", 2), file("old.go", 0, "removed")];
const impacted: Impacted[] = [
  { path: "internal/analyze/a.go", depth: 1, via: "internal/shell/shell.go", test: false },
  { path: "main.go", depth: 2, via: "internal/shell/shell.go", test: false },
];
const edges: [string, string][] = [
  ["internal/analyze/a.go", "internal/shell/shell.go"],
  ["main.go", "internal/analyze/a.go"],
];

describe("blast radar", () => {
  const radar = buildRadar(files, impacted, edges, map);

  it("counts every file in the repository towards its area", () => {
    expect(Object.fromEntries(areaTotals(map))).toEqual({
      "internal/shell": 4,
      "internal/analyze": 1,
      "internal/render": 6,
      "(root)": 5,
    });
  });

  it("puts each file on the ring for its distance from the change", () => {
    const dist = (p: string) => Math.hypot(radar.byPath.get(p)!.x - CENTER, radar.byPath.get(p)!.y - CENTER);
    expect(dist("internal/shell/shell.go")).toBeCloseTo(RINGS[0]);
    expect(dist("internal/analyze/a.go")).toBeCloseTo(RINGS[1]);
    expect(dist("main.go")).toBeCloseTo(RINGS[2]);
    expect(radar.byPath.get("old.go")?.state).toBe("removed");
  });

  it("gives every area a slice that doesn't overlap the next", () => {
    expect(radar.sectors.map((s) => s.area).sort()).toEqual(["(root)", "internal/analyze", "internal/shell"]);
    const sorted = [...radar.sectors].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThan(sorted[i - 1].end);
    expect(sorted[sorted.length - 1].end - sorted[0].start).toBeLessThan(Math.PI * 2);
    const root = radar.sectors.find((s) => s.area === "(root)")!;
    expect(root).toMatchObject({ changed: 1, impacted: 1, total: 5 });
  });

  it("traces a ripple file back to the change, and a changed file out to everything it reaches", () => {
    expect([...trace(radar, "main.go")].sort()).toEqual(["internal/analyze/a.go", "internal/shell/shell.go", "main.go"]);
    expect([...trace(radar, "internal/shell/shell.go")].sort()).toEqual(["internal/analyze/a.go", "internal/shell/shell.go", "main.go"]);
    expect([...trace(radar, "internal/analyze/a.go")].sort()).toEqual(["internal/analyze/a.go", "internal/shell/shell.go"]);
  });
});
