/**
 * The pre-revamp landing and explorer pages are gone, and so is the Kerala
 * banner. All of it stays gone.
 *
 * Deleting a directory is easy; deleting it without leaving a dangling import,
 * a dead route or a quarantine entry that a new file could later be dropped
 * into is the part that needs a test. All three are checked here, so the
 * removal cannot half-undo itself in a later merge.
 *
 * The banner is checked from the repository root rather than from `src/`,
 * because its two halves lived outside it: the renderer under `scripts/` and
 * the PNGs under `public/`. A merge that restores either without the other
 * gives the site a script writing an image nothing reads, or an image the
 * masthead no longer draws.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const FRONTEND = path.resolve(SRC, "..");
const REPO = path.resolve(FRONTEND, "..");
const SELF = path.join(SRC, "test", "legacy-removed.test.ts");

/** Paths Unit 10 removed, with the identifiers that referenced them. */
const REMOVED = [
  { file: "components/landing", token: "components/landing" },
  { file: "components/explorer", token: "components/explorer" },
  { file: "pages/LandingPage.tsx", token: "LandingPage" },
  { file: "pages/ExplorerPage.tsx", token: "ExplorerPage" },
];

/**
 * The Kerala banner, deleted with the collapsing nameplate that drew it. The
 * ODbL attribution it carried did not go with it: it is in the footer, and
 * `shell.test.tsx` holds it there.
 */
const BANNER = {
  files: [
    path.join(REPO, "scripts", "render_banner.py"),
    path.join(FRONTEND, "public", "banner-kerala-light.png"),
    path.join(FRONTEND, "public", "banner-kerala-dark.png"),
  ],
  tokens: ["render_banner", "banner-kerala"],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : walk(full);
    }
    return [full];
  });
}

const sourceFiles = walk(SRC).filter(
  (file) => /\.(tsx?|css)$/.test(file) && file !== SELF,
);

describe("the removed pages", () => {
  it("are no longer on disk", () => {
    for (const { file } of REMOVED) {
      expect(existsSync(path.join(SRC, file)), file).toBe(false);
    }
  });

  it("are imported nowhere", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const { token } of REMOVED) {
        if (source.includes(token)) {
          offenders.push(`${path.relative(SRC, file)} references ${token}`);
        }
      }
    }

    expect(offenders.join("\n")).toBe("");
  });

  it("no longer appear in the token lint's quarantine list", () => {
    // The quarantine may only shrink. An entry naming a path that no longer
    // exists is a hole a new file could be dropped into and escape the lint.
    const lint = readFileSync(path.join(SRC, "test", "tokens.test.ts"), "utf8");
    const list = lint.slice(lint.indexOf("const QUARANTINE"), lint.indexOf("];"));

    expect(list).not.toContain("landing");
    expect(list).not.toContain("explorer");
  });
});

describe("the Kerala banner", () => {
  it("is no longer on disk, renderer or images", () => {
    for (const file of BANNER.files) {
      expect(existsSync(file), path.relative(REPO, file)).toBe(false);
    }
  });

  it("is named by no source file", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const token of BANNER.tokens) {
        if (source.includes(token)) {
          offenders.push(`${path.relative(SRC, file)} references ${token}`);
        }
      }
    }

    expect(offenders.join("\n")).toBe("");
  });
});
