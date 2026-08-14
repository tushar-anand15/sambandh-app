/**
 * The pre-revamp landing and explorer pages are gone, and stay gone.
 *
 * Deleting a directory is easy; deleting it without leaving a dangling import,
 * a dead route or a quarantine entry that a new file could later be dropped
 * into is the part that needs a test. All three are checked here, so the
 * removal cannot half-undo itself in a later merge.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const SELF = path.join(SRC, "test", "legacy-removed.test.ts");

/** Paths Unit 10 removed, with the identifiers that referenced them. */
const REMOVED = [
  { file: "components/landing", token: "components/landing" },
  { file: "components/explorer", token: "components/explorer" },
  { file: "pages/LandingPage.tsx", token: "LandingPage" },
  { file: "pages/ExplorerPage.tsx", token: "ExplorerPage" },
];

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
