---
title: "Writing instructions for Gram Sambandh"
type: instructions
status: active
date: 2026-08-12
applies_to: [sulekha, sambandh_preprocessing, sambandh-app]
---

# How to write for Gram Sambandh

Every word on this site — page copy, chart titles, tooltips, empty states, method
notes, commit messages, docs — follows this file. Copy it into each repo that
produces user-facing text and point the agent at it before it writes anything.

The site publishes government data about Kerala's local bodies. Its credibility
rests on being visibly plain about what the data says and what it does not. Copy
that sounds impressed with itself costs us that. The target voice is a careful
statistician explaining a table to a colleague: specific, unhurried, willing to
say "we don't know."

The rules below are derived from
[Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
Treat them as hard constraints, not preferences.

---

## 1. Never claim significance. Report the fact.

The single most reliable tell is prose that tells the reader something matters
instead of showing them what it is.

Banned outright — do not use these constructions anywhere:

> stands as · serves as · is a testament to · plays a crucial role · plays a
> pivotal role · underscores the importance of · reflects broader · symbolises
> the ongoing · contributes to · sets the stage for · marks a shift · represents
> a shift · a key turning point · the evolving landscape of · highlighting ·
> showcasing · emphasising · ensuring · fostering · cultivating · enhancing ·
> valuable insights · resonates with · aligns with

Also banned: **boasts, vibrant, rich, profound, exemplifies, commitment to,
groundbreaking, renowned, diverse array, nestled, in the heart of, delve,
intricate, interplay, meticulous, tapestry, garner, bolstered, enduring,
seamless, robust, comprehensive** (as praise), **leverage** (as a verb).

Rewrite by deleting the claim and keeping the number.

- ✗ "The dashboard highlights the crucial role of own-fund spending, showcasing
  how panchayats allocate resources."
- ✓ "Own funds paid for 12% of project spending in 2023–24, down from 19% in
  2019–20."

- ✗ "This map serves as a valuable tool for understanding Kerala's evolving
  political landscape."
- ✓ "Ward boundaries as delimited for the 2025 election. Earlier cycles use
  local-body boundaries; ward polygons for 2010–2020 have never been published."

## 2. Use "is" and "has".

Do not reach for `serves as`, `functions as`, `operates as`, `represents`,
`marks` when you mean **is**. Do not reach for `boasts`, `features`,
`maintains`, `offers` when you mean **has**. The plain copulative is almost
always the right verb.

- ✗ "Thiruvananthapuram Corporation boasts 100 wards."
- ✓ "Thiruvananthapuram Corporation has 100 wards."

## 3. No negative parallelism.

All three shapes are banned:

- "Not just X, but Y" / "not only X but also Y"
- "It's not X, it's Y" / "not a mirror but a portal"
- "X rather than Y" used for rhetorical contrast

State the positive claim once. If the contrast is genuinely load-bearing (a
common misreading you must pre-empt), write it as two sentences, the second
beginning with a plain qualifier.

- ✗ "Sulekha records projects, not outcomes — it's not a measure of delivery but
  of intent."
- ✓ "Sulekha records planned projects and their sanctioned amounts. It does not
  record whether the work was completed."

## 4. No rule of three.

Three adjectives, three parallel clauses, three-item lists that exist for rhythm
rather than because there are exactly three things. If there are four facts,
give four. If there is one, give one.

- ✗ "clean, minimal, and accessible"
- ✓ "18px serif, one column, 70 characters wide"

## 5. Attribute or delete.

No "experts argue", "observers have noted", "industry reports suggest", "studies
show", "it is widely regarded". Every non-obvious claim names its source
inline, with a year. If you cannot name the source, the sentence does not ship.

For our own data, the source is a file and a build: "from
`data/final/2025/candidates_2025.csv`, built 31 July 2026". Say so in method
notes.

## 6. No challenges-and-future-prospects paragraph.

Do not end a page with "Despite these strengths, [X] faces challenges…
Continued efforts may…". Do not speculate about what the data "could enable" or
what "future work might explore". Either state a concrete, decided next step
with an owner, or end the page.

Ending on a fact is fine. Pages do not need conclusions.

## 7. Say what is missing, precisely.

Gaps are the most useful thing we publish and the easiest to fudge. Name the
gap, its extent, and its cause.

- ✗ "Data coverage varies across years."
- ✓ "No ward-level boundaries exist for 2010, 2015 or 2020. opendatakerala
  publishes local-body polygons only, from a single November 2020 snapshot, and
  we reuse that snapshot for all three earlier cycles."

Never write "as of my knowledge cutoff", never speculate about what sources
might exist, never leave `[insert X]`, `[citation needed]`, `TODO` or a
placeholder in shipped copy.

## 8. Numbers

- Indian numbering for money in Indian contexts: ₹1.2 crore, ₹45 lakh. Do not
  mix crore with millions on the same page.
- Give the denominator. "3,412 projects (of 41,900 statewide)" beats "3,412
  projects".
- Round in prose, exact in tables. Never round in a downloadable file.
- Financial years always as `2023–24`, en dash, never `2023-2024` or `FY24`.
- Percentages get one decimal at most, and a base: "12.4% of 8,231 resolutions".
- Do not describe a change as significant, dramatic, sharp or notable. Give the
  two numbers and the period.

## 9. Sentence and section shape

- Lead with the fact. No throat-clearing preamble ("It is important to note
  that", "In today's world", "This section explores").
- One idea per sentence. Median sentence under 25 words.
- Vary sentence length deliberately. Uniform 18-word sentences read as machine
  output even when every word is fine.
- Repeat a noun rather than inventing a synonym for it. "Local body" stays
  "local body" — not "civic entity", "administrative unit", "governing body".
  Elegant variation is a tell, and here it is also imprecise: those terms mean
  different things.
- Sentence case for every heading, always. Never Title Case.
- Headings name their content ("How the 2010 candidate file was rebuilt"), never
  a category ("Overview", "Key Insights", "Background", "Awards and
  recognition").

## 10. Formatting

- Bold is for the first mention of a defined term, and nothing else. Never bold
  a whole sentence or a lead-in phrase.
- No em dashes as a general-purpose connector. Use a full stop, a comma, or a
  colon. At most one em dash per page, and only for a genuine aside.
- Straight quotes and apostrophes in code, source files and markup. Typographic
  quotes only in rendered prose, applied by the renderer.
- No emoji anywhere in the product or the docs.
- Bulleted lists only when the items are genuinely parallel and unordered.
  Three sentences of prose beat three bullets of sentence fragments. Never use
  an inline-header list (`**Thing:** description`) as a substitute for writing
  paragraphs.
- Do not skip heading levels. No horizontal rule immediately before a heading.
- Tables hold data. They do not hold prose comparisons or feature matrices.

## 11. Never address the reader as a collaborator

No "you", no "let's", no "we can see that", no "as we explore". The site
addresses a reader who wants a number. First-person plural is allowed only in
method notes describing what the project actually did: "We reused the 2020
polygons for 2015."

## 12. Chart and UI copy

- Chart title states the finding or the measure, with unit and period:
  "Project spending by sector, Kollam district panchayat, 2023–24 (₹ crore)".
  Never "Spending Overview" or "A Look at Spending".
- Axis labels carry units. Legends use the source's own category names, not
  prettified ones.
- Every chart carries a source line naming the dataset and the build date.
- Empty states state the cause: "No meetings recorded for this body in 2021–22."
  Never "Nothing to see here" or "Oops!".
- Errors state what failed and what the reader can do. No apology, no
  exclamation mark.
- Buttons are verbs: "Download CSV", not "Get started" or "Explore".

## 13. Commits, PRs and docs

- Commit subject: imperative, lowercase after the type, no full stop —
  `feat(finances): carry-forward project rollup per local body`.
- Describe what changed and why. Do not assert that the change adheres to
  standards, preserves citations, retains accuracy, or is comprehensive. Those
  sentences are a documented AI tell and they are also unverifiable.
- Documentation states current behaviour in present tense. Historical
  narration of the implementation belongs in the plan, not the docs.

## 14. AI assistant output

The assistant is bound by every rule above, plus:

- Answer with a number and its source, or say the data does not contain it.
- Quote the retrieved figure and name the file, local body and year it came
  from.
- Never estimate, interpolate or infer a value that is not in the data. Refusal
  is a correct answer.
- No preamble ("Great question!"), no summary of the question back at the user,
  no offer of further help at the end.

---

## Self-check before shipping any copy

Read the draft once against this list. Any yes is a rewrite.

1. Does a sentence tell the reader that something is important, crucial, key or
   significant?
2. Does any sentence contain *highlighting*, *showcasing*, *emphasising*,
   *fostering*, *ensuring*, *underscoring*, *aligns with*, *serves as*?
3. Is there a "not just X but Y", a "not X, it's Y", or a rhetorical "rather
   than"?
4. Is there a three-item list whose third item is filler?
5. Is there a claim with no named source and no year?
6. Does a page end with challenges, prospects or a call to explore?
7. Is a heading in Title Case, or named "Overview" / "Key Insights"?
8. Is a synonym doing work that repeating the noun would do better?
9. Are there more em dashes than there are genuine asides?
10. Is a number given without its denominator, unit or period?
11. Does the copy address the reader as "you" outside a method note?

If a sentence survives all eleven and still reads like filler, delete it. The
page is better one sentence shorter.
