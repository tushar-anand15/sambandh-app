/**
 * The page makes no external requests.
 *
 * Checked against a real production build rather than against index.html,
 * because a font host can re-enter through a CSS @import, a vendored
 * stylesheet or a dependency's injected <link> — none of which are visible in
 * the source file everyone remembers to look at.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

const FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "fonts.bunny.net",
  "use.typekit.net",
  "p.typekit.net",
  "fast.fonts.net",
];

/**
 * Not asserted here, and deliberately named rather than left as a surprise:
 * `react-pdf` still fetches its pdf.js worker from unpkg.com, in
 * components/viewer/DocumentViewer.tsx and components/chat/SourceDrawer.tsx.
 * That is a genuine external request and it survives this unit — it belongs to
 * the PDF viewer work, not to type. Vendoring it means importing
 * `pdfjs-dist/build/pdf.worker.min.mjs?url` and pointing workerSrc at that.
 */

let bundle = "";

function readAll(dir: string): string {
  return readdirSync(dir)
    .map((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return readAll(full);
      return /\.(html|css|js)$/.test(full) ? readFileSync(full, "utf8") : "";
    })
    .join("\n");
}

beforeAll(() => {
  const out = mkdtempSync(path.join(tmpdir(), "gs-bundle-"));
  execFileSync(
    "npx",
    ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"],
    { cwd: ROOT, stdio: "pipe" },
  );
  bundle = readAll(out);
}, 180_000);

describe("the built bundle", () => {
  it("references no external font host", () => {
    for (const host of FONT_HOSTS) {
      expect(bundle, `bundle reaches out to ${host}`).not.toContain(host);
    }
  });

  it("carries no @font-face pointing off-origin", () => {
    const faces = [...bundle.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
    for (const face of faces) {
      expect(face).not.toMatch(/url\(\s*["']?https?:/);
    }
  });

  it("ships the token palette rather than a stale @theme", () => {
    // Cheap proof the stylesheet in the bundle is the designed one — paddy
    // husk ground and wet paddy accent, in both themes.
    expect(bundle.toLowerCase()).toContain("#f1f3e9");
    expect(bundle.toLowerCase()).toContain("#3e5c2a");
    expect(bundle.toLowerCase()).toContain("#9cc271");
  });

  it("contains no framer-motion", () => {
    expect(bundle).not.toContain("framer-motion");
    expect(readFileSync(path.join(ROOT, "package.json"), "utf8")).not.toContain(
      "framer-motion",
    );
  });
});
