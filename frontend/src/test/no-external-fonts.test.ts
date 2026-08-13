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
 * The pdf.js worker is checked here too. It used to come from unpkg.com, which
 * was the one request this site sent off its own origin;
 * components/viewer/pdfWorker.ts now points workerSrc at the copy Vite emits
 * from node_modules. components/viewer/DocumentViewer.tsx still carries the old
 * line and is the one file that must not regain an importer while it does.
 */

let bundle = "";
/** Where the build under test landed, for assertions about emitted assets. */
let BUILD_DIR = "";

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
  BUILD_DIR = out;
}, 180_000);

describe("the built bundle", () => {
  it("references no external font host", () => {
    for (const host of FONT_HOSTS) {
      expect(bundle, `bundle reaches out to ${host}`).not.toContain(host);
    }
  });

  it("loads the pdf.js worker from the bundle, not from a CDN", () => {
    expect(bundle).not.toContain("unpkg.com");
    expect(readdirSync(path.join(BUILD_DIR, "assets")).join(" ")).toMatch(
      /pdf\.worker[.\w-]*\.mjs/,
    );
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
