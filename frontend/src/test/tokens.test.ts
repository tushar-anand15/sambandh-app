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

/**
 * Cleared by: Unit 10 (landing and explorer, both deleted), the assistant unit
 * (chat, dashboard and layouts, all rewritten against the tokens), later units
 * (viewer, and the three pages that remain under `pages/`).
 *
 * `pages/` stays only for LoginPage and RegisterPage. ChatbotPage was rewritten
 * with the assistant and is clean, but the list is a directory list -- the
 * check below calls `isDirectory()` -- so it cannot name two files out of
 * three.
 */
const QUARANTINE = ["components/viewer"];

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

// ---------------------------------------------------------------------------
// Front fills and the hairline that separates them
// ---------------------------------------------------------------------------

/**
 * Every pairwise contrast among the four front fills is between 1.00 and
 * 1.96:1, so two neighbouring wards of different fronts have no edge of their
 * own. WCAG 1.4.11 does not ask for the fills to be repaletted -- it allows
 * adjacent graphical objects to share a border instead, and the fronts cannot
 * be repaletted anyway because their colours mean something outside this site.
 *
 * So: anything painted with a front colour is outlined in --front-stroke. A
 * white outline was measured and rejected; it clears UDF and LDF and fails NDA
 * and OTH.
 */
const FRONT_FILL =
  /(?:^|[;{\s])(?:fill|background|background-color)\s*:\s*var\(--(?:ldf|udf|nda|oth)\)/;
const FRONT_HAIRLINE = /stroke\s*:\s*var\(--front-stroke\)/;

function frontFillViolations(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  const lineAt = (index: number) => source.slice(0, index).split("\n").length;

  // Innermost braces only: a declaration block, not the rule that wraps it.
  for (const m of source.matchAll(/\{([^{}]*)\}/g)) {
    const body = m[1];
    if (!FRONT_FILL.test(body)) continue;
    if (FRONT_HAIRLINE.test(body)) continue;
    found.push({
      file,
      line: lineAt(m.index),
      text: body.trim().split("\n")[0],
      why: "front fill with no var(--front-stroke) hairline; the four fills contrast 1.00–1.96:1 with each other",
    });
  }
  return found;
}

function lint(file: string): Violation[] {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".css")) {
    return [...cssViolations(file, source), ...frontFillViolations(file, source)];
  }
  return [
    ...utilityViolations(file, source),
    ...inlineStyleViolations(file, source),
    // Styled-JSX and CSS-in-template-literals would slip past the utility
    // scan, so TSX is checked for raw declarations too.
    ...cssViolations(file, source),
    ...frontFillViolations(file, source),
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

// ---------------------------------------------------------------------------
// Colour-vision simulation and ΔE
//
// Forty lines of matrix arithmetic rather than a dependency. This site ships
// zero external requests and its package list is a reviewed thing; a colour
// library would be a permanent supply-chain edge for one assertion that runs
// on four hexes.
//
// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear light.
// ΔE is CIE76 in Lab under D65 -- crude next to CIEDE2000, but the threshold
// here is 15, far above the ~2.3 where the two disagree. These matrices
// reproduce the planning measurements to within about one ΔE.
// ---------------------------------------------------------------------------

type Matrix = readonly (readonly [number, number, number])[];

/** Red-blind. Roughly 1 in 100 men; the more common of the two. */
const DEUTERANOPIA: Matrix = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

/** Green-blind. */
const PROTANOPIA: Matrix = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** `#rrggbb` to linear-light RGB. */
function linearRgb(hex: string): number[] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
}

/** Round-tripped through sRGB so the result is a colour a screen can show. */
function simulate(rgb: number[], m: Matrix): number[] {
  return m.map((row) =>
    toLinear(toSrgb(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
  );
}

function lab(rgb: number[]): [number, number, number] {
  const [r, g, b] = rgb;
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ];
  const [fx, fy, fz] = xyz.map((t) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116,
  );
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: string, b: string, cvd?: Matrix): number {
  const one = cvd ? simulate(linearRgb(a), cvd) : linearRgb(a);
  const two = cvd ? simulate(linearRgb(b), cvd) : linearRgb(b);
  const [l1, a1, b1] = lab(one);
  const [l2, a2, b2] = lab(two);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// The token definitions
// ---------------------------------------------------------------------------

/** The fronts, plus the hairline that outlines them: all theme-invariant. */
const SEMANTIC = ["--ldf", "--udf", "--nda", "--oth", "--front-stroke"];

/** ~15 is the floor for telling two categories apart; 20 is comfortable. */
const DELTA_E_FLOOR = 15;

interface Declaration {
  name: string;
  value: string;
}

function declarations(body: string): Declaration[] {
  return [...body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }));
}

/** Anything that names a colour, however it names it. */
const IS_COLOUR = /#[0-9a-f]{3,8}\b|light-dark\(/i;
const PAIR = /^light-dark\(\s*(#[0-9a-f]{3,8})\s*,\s*(#[0-9a-f]{3,8})\s*\)$/i;
const PLAIN = /^#[0-9a-f]{6}$/i;

/**
 * Two rules, one pass.
 *
 * A themed colour must be a single `light-dark(a, b)` carrying both halves.
 * The palette used to be written three times -- a light `:root`, a
 * `prefers-color-scheme` block and a `[data-theme]` block -- and the failure
 * that arrangement invites is a token introduced in a dark block and undefined
 * everywhere else, leaving a reader whose system reports no preference with
 * nothing. A pair cannot half-exist.
 *
 * A semantic colour must be a plain hex. LDF red means the same thing in dark
 * mode, on a printout and in a screenshot; a front that varied by theme would
 * teach the legend twice.
 */
function paletteIssues(body: string): string[] {
  const issues: string[] = [];
  for (const { name, value } of declarations(body)) {
    if (!IS_COLOUR.test(value)) continue;
    if (SEMANTIC.includes(name)) {
      if (!PLAIN.test(value)) {
        issues.push(
          `${name} is semantic and must be one plain colour, not ${value}`,
        );
      }
    } else if (!PAIR.test(value)) {
      issues.push(
        `${name} must be a single light-dark(light, dark) with both halves: ${value}`,
      );
    }
  }
  return issues;
}

/**
 * The accent must never read as a front.
 *
 * Both halves of the accent are checked against all four fronts, because a
 * legend swatch and a link can share a screen in either theme. The canvas drew
 * the light accent as #14549b, which measures ΔE 8.5 against the UDF blue
 * under deuteranopia -- both are blues, and blue survives red-green CVD, so
 * this is a collision in normal vision that CVD barely worsens. #0b2f5e reads
 * as the same navy and clears the floor.
 *
 * Front-against-front is deliberately NOT checked here. LDF against NDA is
 * below this floor under deuteranopia and the fronts do not move, so the
 * assertion could not pass and would have to be weakened until it meant
 * nothing. Fronts are separated by --front-stroke instead, which is what
 * WCAG 1.4.11 asks for.
 */
function accentIssues(body: string): string[] {
  const decls = new Map(declarations(body).map((d) => [d.name, d.value]));
  const accent = decls.get("--accent") ?? "";
  const pair = PAIR.exec(accent);
  if (!pair) return [`--accent is not a light-dark() pair: ${accent || "missing"}`];

  const issues: string[] = [];
  for (const half of [pair[1], pair[2]]) {
    for (const front of ["--ldf", "--udf", "--nda", "--oth"]) {
      const colour = decls.get(front);
      if (!colour) {
        issues.push(`${front} is not declared`);
        continue;
      }
      for (const [vision, matrix] of [
        ["deuteranopia", DEUTERANOPIA],
        ["protanopia", PROTANOPIA],
      ] as const) {
        const separation = deltaE(half, colour, matrix);
        if (separation < DELTA_E_FLOOR) {
          issues.push(
            `accent ${half} and ${front} ${colour} are ΔE ${separation.toFixed(
              1,
            )} apart under ${vision}, below the floor of ${DELTA_E_FLOOR}`,
          );
        }
      }
    }
  }
  return issues;
}

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

  const palette = block(":root {");

  it("declares all nine type steps and all eight spacing steps", () => {
    for (let i = 1; i <= SCALE_STEPS; i += 1) {
      expect(css).toMatch(new RegExp(`--t${i}:`));
    }
    for (let i = 1; i <= SPACING_STEPS; i += 1) {
      expect(css).toMatch(new RegExp(`--s${i}:`));
    }
  });

  /**
   * `light-dark()` returns its FIRST argument when `color-scheme` computes to
   * `normal`, so a palette written in pairs with no `color-scheme` on the root
   * is a light-only site that looks correct to whoever built it. The two
   * attribute rules are how the in-page toggle beats the system preference in
   * both directions; without the `light` one, a reader on a dark system who
   * asks for light gets dark.
   */
  it("switches the theme three ways", () => {
    expect(palette).toMatch(/color-scheme:\s*light dark/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light\s*;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark\s*;/);
  });

  it("writes every themed colour as one light-dark() carrying both halves", () => {
    expect(paletteIssues(palette).join("\n")).toBe("");
    // The palette is where the colours are: a sweep that found none would
    // pass silently.
    expect(declarations(palette).filter((d) => IS_COLOUR.test(d.value)).length)
      .toBeGreaterThan(10);
  });

  it("keeps the front colours theme-invariant and plain", () => {
    for (const front of ["--ldf", "--udf", "--nda", "--oth"]) {
      const value = declarations(palette).find((d) => d.name === front)?.value;
      expect(value, `${front} is not declared`).toBeTruthy();
      expect(value, `${front} varies by theme`).not.toContain("light-dark(");
    }
  });

  it("declares the hairline that separates one front from the next", () => {
    // The fills contrast 1.00–1.96:1 with each other, so the border is the
    // whole of their 1.4.11 conformance. Theme-invariant like the fills it
    // outlines, and dark rather than white because white fails NDA and OTH.
    const stroke = declarations(palette).find((d) => d.name === "--front-stroke");
    expect(stroke?.value, "--front-stroke is not declared").toBeTruthy();
    expect(stroke?.value).toMatch(PLAIN);
  });

  it("keeps the accent distinguishable from every front, under CVD", () => {
    expect(accentIssues(palette).join("\n")).toBe("");
  });

  it("catches the palette mistakes when they are planted", () => {
    // The assertions above are all "found nothing", which is also what a
    // broken matcher returns.
    expect(paletteIssues("  --ldf: light-dark(#c8402f, #e05a48);\n").join(" ")).toContain(
      "--ldf is semantic",
    );
    expect(paletteIssues("  --ink: #1b1f24;\n").join(" ")).toContain(
      "--ink must be a single light-dark",
    );
    expect(paletteIssues("  --ink: light-dark(#1b1f24);\n").join(" ")).toContain(
      "--ink must be a single light-dark",
    );

    // The canvas's own accent, which is why this token departs from it.
    const canvasAccent = accentIssues(
      "  --accent: light-dark(#14549b, #7fb2e8);\n  --ldf: #c8402f;\n  --udf: #1f6fb5;\n  --nda: #e0891c;\n  --oth: #98a0a8;\n",
    );
    expect(canvasAccent.join(" ")).toContain("--udf");
    expect(canvasAccent.join(" ")).toContain("deuteranopia");

    // A front fill with no hairline round it.
    expect(
      frontFillViolations("a.css", ".ward { fill: var(--ldf); }").map((v) => v.why).join(" "),
    ).toContain("front fill with no var(--front-stroke)");
    expect(
      frontFillViolations(
        "a.css",
        ".ward { fill: var(--ldf); stroke: var(--front-stroke); stroke-width: 0.75; }",
      ),
    ).toEqual([]);
  });

  it("never paints election data with the accent", () => {
    // The accent is spent on links, hovers and downloads and nowhere else.
    // Here that is not only taste: the accent is a navy and UDF is a blue, so
    // a tile filled or bordered with it reads as a fifth front. It caught
    // exactly that on .tileSelected, which now outlines in ink.
    //
    // Controls are the exception and are allowed it: a focus ring, a range
    // input's accent-color and the active cycle tick are chrome, not data.
    const PAINTS = /(?:^|[^-])(background|background-color|border-color|fill|stroke):\s*var\(--accent\)/m;
    //
    // The walk recurses. The block that draws Kerala's whole result serves
    // both the home page and this one and lives here for exactly this check,
    // so a nested file would otherwise draw election data with no lint over
    // it at all.
    const dir = path.resolve(SRC, "components/elections");
    for (const file of walk(dir)) {
      if (!file.endsWith(".css") && !file.endsWith(".tsx")) continue;
      const body = readFileSync(file, "utf8");
      expect(
        PAINTS.test(body),
        `${path.relative(dir, file)} paints with the accent; ` +
          "fronts use --ldf/--udf/--nda/--oth",
      ).toBe(false);
    }
  });
});
