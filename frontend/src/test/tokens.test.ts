/**
 * The token lint.
 *
 * Wired as a test rather than left to review because this is precisely the rule
 * that erodes quietly: one `text-[13px]` under deadline, then twenty, and the
 * scale is decorative. A design system that is only enforced by attention is
 * enforced by nobody at 6pm on a Friday.
 *
 * What it checks, across src/:
 *   - every font-size resolves to one of the nine scale tokens
 *   - every margin, padding and gap resolves to one of the eight spacing tokens
 *   - the only inline style permitted is a colour resolved from data
 *
 * LEGACY QUARANTINE
 * The pre-revamp pages predate the system and violate it in the hundreds. They
 * are deleted or rewritten in Units 6 and 10 of the revamp plan, so they are
 * quarantined by path below rather than rewritten now. The list may only
 * shrink: a test asserts every quarantined path still exists, so a deleted
 * directory forces its entry out instead of leaving a hole a new file could
 * later be dropped into.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

/** Cleared by: Unit 6 (explorer), Unit 10 (landing), later units (chat, dashboard). */
const QUARANTINE = [
  "components/chat",
  "components/dashboard",
  "components/explorer",
  "components/landing",
  "components/viewer",
  "layouts",
  "pages",
];

const SCALE_STEPS = 9;
const SPACING_STEPS = 8;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : walk(full);
    }
    return [full];
  });
}

function isQuarantined(file: string): boolean {
  const rel = path.relative(SRC, file);
  return QUARANTINE.some((q) => rel === q || rel.startsWith(`${q}${path.sep}`));
}

const allFiles = walk(SRC);

const governedFiles = allFiles.filter(
  (f) =>
    !isQuarantined(f) &&
    /\.(tsx?|css)$/.test(f) &&
    // The lint itself names the patterns it forbids; linting it is circular.
    !f.endsWith(path.join("test", "tokens.test.ts")),
);

/** Every violation carries the file, the line number and the offending text. */
interface Violation {
  file: string;
  line: number;
  text: string;
  why: string;
}

function report(violations: Violation[]): string {
  return violations
    .map((v) => `${path.relative(SRC, v.file)}:${v.line}  ${v.why}\n    ${v.text}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// CSS declarations
// ---------------------------------------------------------------------------

const FONT_SIZE_DECL = /(?:^|[;{])\s*font-size\s*:\s*([^;}]+)/g;
const SPACING_DECL =
  /(?:^|[;{])\s*(margin|padding|gap|row-gap|column-gap)(-[a-z-]+)?\s*:\s*([^;}]+)/g;

const SCALE_TOKEN = /^var\(--t[1-9]\)$/;
/** 0, auto, inherit and env() are absences of spacing, not loose values. */
const SPACING_VALUE = /^(var\(--s[1-8]\)|0|auto|inherit|initial|env\([^)]*\))$/;

function cssViolations(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  const lineAt = (index: number) => source.slice(0, index).split("\n").length;

  for (const m of source.matchAll(FONT_SIZE_DECL)) {
    const value = m[1].trim();
    if (!SCALE_TOKEN.test(value)) {
      found.push({
        file,
        line: lineAt(m.index),
        text: `font-size: ${value}`,
        why: "font-size outside the nine scale tokens (--t1…--t9)",
      });
    }
  }

  for (const m of source.matchAll(SPACING_DECL)) {
    const property = `${m[1]}${m[2] ?? ""}`;
    // Multi-value shorthands: every part must be a token.
    const parts = m[3].trim().split(/\s+(?![^(]*\))/);
    if (!parts.every((p) => SPACING_VALUE.test(p))) {
      found.push({
        file,
        line: lineAt(m.index),
        text: `${property}: ${m[3].trim()}`,
        why: "spacing outside the eight spacing tokens (--s1…--s8)",
      });
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Tailwind utilities in TSX
// ---------------------------------------------------------------------------

const SPACING_UTILITY = "(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)";

/** `text-[13px]`, `p-[10px]`, `gap-[3px]` — the scale bypassed by hand. */
const ARBITRARY = new RegExp(`\\b-?(?:text|${SPACING_UTILITY})-\\[[^\\]]*\\]`, "g");
/** `text-sm`, `text-2xl` — Tailwind's scale, which is not this site's scale. */
const TW_TEXT = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g;
/** `p-4`, `mt-6`, `gap-1.5` — the 0.25rem ramp, not the 8px scale. */
const TW_SPACING = new RegExp(
  `(?<![\\w-])-?${SPACING_UTILITY}-\\d+(?:\\.\\d+)?(?![\\w-])`,
  "g",
);

function utilityViolations(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  source.split("\n").forEach((line, i) => {
    const flag = (re: RegExp, why: string) => {
      for (const m of line.matchAll(re)) {
        found.push({ file, line: i + 1, text: m[0], why });
      }
    };
    flag(ARBITRARY, "arbitrary Tailwind value; use a token utility");
    flag(TW_TEXT, "Tailwind's type scale; use text-t1…text-t9");
    flag(TW_SPACING, "Tailwind's spacing ramp; use p-s4, gap-s2 and so on");
  });
  return found;
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const INLINE_STYLE = /style=\{\{([^}]*(?:\}[^}]*)*?)\}\}/g;
/**
 * The single exception the system allows: a front colour resolved from data,
 * which cannot be a class because the party is only known at runtime.
 */
const RUNTIME_COLOUR =
  /^\s*(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*[^,]*var\(--[^)]*\)/;

function inlineStyleViolations(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  const lineAt = (index: number) => source.slice(0, index).split("\n").length;

  for (const m of source.matchAll(INLINE_STYLE)) {
    const declarations = m[1].split(",").filter((d) => d.trim());
    for (const declaration of declarations) {
      if (!RUNTIME_COLOUR.test(declaration)) {
        found.push({
          file,
          line: lineAt(m.index),
          text: declaration.trim(),
          why: "inline style; only a runtime colour (var(--ldf) and friends) is allowed",
        });
      }
    }
  }
  return found;
}

function lint(file: string): Violation[] {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".css")) return cssViolations(file, source);
  return [
    ...utilityViolations(file, source),
    ...inlineStyleViolations(file, source),
    // Styled-JSX and CSS-in-template-literals would slip past the utility
    // scan, so TSX is checked for raw declarations too.
    ...cssViolations(file, source),
  ];
}

describe("token lint", () => {
  it("governs every non-quarantined file in src/", () => {
    // Guards against the lint quietly covering nothing after a refactor moves
    // files around.
    expect(governedFiles.length).toBeGreaterThan(3);
    expect(governedFiles.some((f) => f.includes("index.css"))).toBe(true);
    expect(governedFiles.some((f) => f.includes(path.join("components", "shell")))).toBe(
      true,
    );
  });

  it("finds no font-size outside the type scale and no raw spacing", () => {
    const violations = governedFiles.flatMap(lint);
    expect(report(violations)).toBe("");
  });

  it("catches a violation when one is planted", () => {
    // The lint's own regression test. Without this, a refactor that broke the
    // matchers would leave a green suite that checks nothing.
    const planted = [
      ["a.css", ".x { font-size: 13px; }", "font-size outside"],
      ["a.css", ".x { padding: 10px; }", "spacing outside"],
      ["a.css", ".x { margin-block: var(--s4) 7px; }", "spacing outside"],
      ["a.tsx", '<p className="text-[13px]" />', "arbitrary Tailwind value"],
      ["a.tsx", '<p className="text-sm" />', "Tailwind's type scale"],
      ["a.tsx", '<p className="mt-6" />', "Tailwind's spacing ramp"],
      ["a.tsx", '<p className="gap-1.5" />', "Tailwind's spacing ramp"],
      ["a.tsx", "<p style={{ fontSize: 10 }} />", "inline style"],
    ] as const;

    for (const [name, source, why] of planted) {
      const violations = name.endsWith(".css")
        ? cssViolations(name, source)
        : [
            ...utilityViolations(name, source),
            ...inlineStyleViolations(name, source),
            ...cssViolations(name, source),
          ];
      expect(violations.map((v) => v.why).join(" | "), source).toContain(why);
    }
  });

  it("passes the forms the system does allow", () => {
    expect(cssViolations("a.css", ".x { font-size: var(--t4); }")).toEqual([]);
    expect(cssViolations("a.css", ".x { margin-block: var(--s7) var(--s3); }")).toEqual(
      [],
    );
    expect(cssViolations("a.css", ".x { padding-bottom: env(safe-area-inset-bottom); }")).toEqual(
      [],
    );
    expect(
      inlineStyleViolations("a.tsx", "<b style={{ color: `var(--${front})` }} />"),
    ).toEqual([]);
    expect(utilityViolations("a.tsx", '<p className="p-s4 text-t3 gap-s2" />')).toEqual(
      [],
    );
  });

  it("keeps the legacy quarantine honest", () => {
    for (const entry of QUARANTINE) {
      // A quarantined path that no longer exists must leave the list, so the
      // list can only shrink as Units 6 and 10 delete these pages.
      expect(
        statSync(path.join(SRC, entry)).isDirectory(),
        `quarantined path no longer exists — remove it from QUARANTINE: ${entry}`,
      ).toBe(true);
    }
  });
});

describe("the token definitions themselves", () => {
  const css = readFileSync(path.join(SRC, "index.css"), "utf8");

  /** The body of the first block whose selector starts with `selector`. */
  function block(selector: string): string {
    const start = css.indexOf(selector);
    expect(start, `no ${selector} block in index.css`).toBeGreaterThan(-1);
    const open = css.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) return css.slice(open + 1, i);
      }
    }
    throw new Error(`unterminated ${selector} block`);
  }

  it("declares all nine type steps and all eight spacing steps", () => {
    for (let i = 1; i <= SCALE_STEPS; i += 1) {
      expect(css).toMatch(new RegExp(`--t${i}:`));
    }
    for (let i = 1; i <= SPACING_STEPS; i += 1) {
      expect(css).toMatch(new RegExp(`--s${i}:`));
    }
  });

  it("declares every colour in the bare :root, not only in a dark block", () => {
    const declared = (body: string) =>
      new Set([...body.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));

    const light = declared(block(":root {"));
    const dark = new Set([
      ...declared(block("@media (prefers-color-scheme: dark)")),
      ...declared(block(':root[data-theme="dark"]')),
    ]);

    expect(dark.size).toBeGreaterThan(0);
    for (const token of dark) {
      // A token that exists only under a dark selector leaves a reader whose
      // system reports no preference with no value at all.
      expect(light.has(token), `${token} is declared only in a dark block`).toBe(true);
    }
  });

  it("keeps the front colours out of the theme blocks", () => {
    // Front colours are semantic: LDF red must be the same red in dark mode.
    const themed =
      block("@media (prefers-color-scheme: dark)") +
      block(':root[data-theme="dark"]');
    for (const front of ["--ldf", "--udf", "--nda", "--oth"]) {
      expect(themed).not.toMatch(new RegExp(`^\\s*${front}:`, "m"));
    }
  });

  it("spends laterite exactly once", () => {
    // The @theme bridge is a declaration, not a use, so it does not count
    // against the budget — the band above the masthead is the only use.
    const styles = css.replace(block("@theme inline"), "");
    expect([...styles.matchAll(/var\(--earth\)/g)]).toHaveLength(1);
  });
});
