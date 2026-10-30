// Groups paths into areas: the top folder, or two levels for monorepo layouts.
// Shared by the server and the browser.

const MONOREPO_ROOTS = /^(src|packages|apps|libs|lib|internal|pkg|crates|services|modules|components|cmd)$/;

const ROOT_AREA = "(root)";

export function areaOf(path: string): string {
  const parts = path.split("/");
  if (parts.length === 1) return ROOT_AREA;
  if (MONOREPO_ROOTS.test(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
