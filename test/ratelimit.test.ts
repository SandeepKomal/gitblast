import { describe, expect, it } from "vitest";
import { allow, clientKey } from "@/lib/ratelimit";

describe("clientKey", () => {
  it("prefers the proxy-set real IP", () => {
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores a spoofed first X-Forwarded-For entry", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("falls back when no proxy headers are present", () => {
    expect(clientKey(new Headers())).toBe("local");
  });
});

describe("allow", () => {
  it("limits each client separately", () => {
    for (let i = 0; i < 40; i++) expect(allow("192.0.2.1").ok).toBe(true);
    expect(allow("192.0.2.1")).toMatchObject({ ok: false });
    expect(allow("192.0.2.2").ok).toBe(true);
  });
});
