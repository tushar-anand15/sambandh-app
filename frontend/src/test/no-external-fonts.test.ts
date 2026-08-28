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
    // Cheap proof the stylesheet in the bundle is the designed one — the
    // Atlas ground and coral accent, in both themes.
    expect(bundle.toLowerCase()).toContain("#f5f5f5");
    expect(bundle.toLowerCase()).toContain("#ff6653");
    expect(bundle.toLowerCase()).toContain("#ff7a68");
  });

  /**
   * Icons are the second asset type that can quietly reach off-origin — a
   * favicon is usually written as a bare <link> that nobody re-reads, and a
   * generated one arrives as an absolute URL to whatever service made it.
   */
  it("ships the icons from its own origin", () => {
    const html = readFileSync(path.join(BUILD_DIR, "index.html"), "utf8");
    const links = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(links.length, "index.html declares no icon at all").toBeGreaterThan(0);
    for (const link of links) {
      expect(link, `icon loaded off-origin: ${link}`).not.toMatch(/href="(?:https?:)?\/\//);
    }
    for (const asset of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
      expect(readdirSync(BUILD_DIR), `${asset} was not emitted`).toContain(asset);
    }
  });

  it("has a favicon that parses and fetches nothing", () => {
    const svg = readFileSync(path.join(BUILD_DIR, "favicon.svg"), "utf8");

    // The mark is drawn entirely in paths and a circle. An <image>, a <use>
    // pointing off-document, a font in a <text>, or an @import would each be a
    // request from a file that is fetched on every single page load.
    expect(svg).not.toMatch(/<image\b|@import|font-family|xlink:href|url\(\s*["']?https?:/);

    // The SVG namespace is a URI, not an address, and is never fetched. Every
    // other http in the file would be.
    expect(svg.replace(/xmlns(:\w+)?="[^"]*"/g, "")).not.toContain("http");

    // It parses. This is not paranoia: the first draft of this file explained
    // itself in a comment that contained "--", which is illegal inside an XML
    // comment, and the whole icon silently failed to render as a broken image.
    // Nothing about a favicon fails loudly, so it gets asserted here.
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(
      doc.querySelector("parsererror")?.textContent ?? "",
      "favicon.svg is not well-formed XML",
    ).toBe("");
    expect(doc.documentElement.tagName).toBe("svg");

    // It carries its own ground and its own ink, because a favicon sits on
    // browser chrome and inherits no colour from anything.
    expect(doc.querySelector("rect")?.getAttribute("fill")?.toLowerCase()).toBe("#f1f3e9");
    expect(doc.querySelector("circle")?.getAttribute("fill")?.toLowerCase()).toBe("#3e5c2a");
  });

  it("contains no framer-motion", () => {
    expect(bundle).not.toContain("framer-motion");
    expect(readFileSync(path.join(ROOT, "package.json"), "utf8")).not.toContain(
      "framer-motion",
    );
  });
});
