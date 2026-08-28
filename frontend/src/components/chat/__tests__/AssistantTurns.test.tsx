/**
 * A turn, and the citations under it.
 *
 * R40: every answer names the project number and the local body it came from,
 * and every citation opens the scan. The second half is the one that rots
 * quietly — a chip that renders and does nothing looks identical to a chip that
 * works — so the click is asserted, not the markup.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MessageBubble, { citationLabel } from "../MessageBubble";
import type { ChatMessage, ChatSource } from "@/types";

const SOURCE: ChatSource = {
  document_id: "d1",
  document_title: "Project 2023-24/GP/1147 — Amboori",
  chunk_id: "c1",
  excerpt: "held pending a revised estimate",
  page: 3,
  lb_name: "Amboori",
};

const ANSWER: ChatMessage = {
  id: "m2",
  role: "assistant",
  content: "The sanction order records the work as held pending a revised estimate.",
  sources: [SOURCE],
  timestamp: new Date(),
};

describe("a turn", () => {
  it("sets the reader's question in their own words", () => {
    render(
      <MessageBubble
        message={{
          id: "m1",
          role: "user",
          content: "എന്തുകൊണ്ടാണ് അമ്പൂരിയിലെ കുടിവെള്ള പദ്ധതി വൈകിയത്?",
          timestamp: new Date(),
        }}
      />,
    );

    expect(screen.getByText("Asked")).toBeInTheDocument();
    expect(
      screen.getByText("എന്തുകൊണ്ടാണ് അമ്പൂരിയിലെ കുടിവെള്ള പദ്ധതി വൈകിയത്?"),
    ).toBeInTheDocument();
  });

  it("says where the answer came from", () => {
    render(<MessageBubble message={ANSWER} />);
    expect(screen.getByText("From the sanctioning documents")).toBeInTheDocument();
  });
});

describe("a citation", () => {
  it("names the project number and the local body", () => {
    expect(citationLabel(SOURCE)).toBe("Project 2023-24/GP/1147 — Amboori, p. 3");
  });

  it("does not repeat the local body when the title already carries it", () => {
    expect(citationLabel({ ...SOURCE, page: 0 })).toBe(
      "Project 2023-24/GP/1147 — Amboori",
    );
  });

  it("names it when the title does not", () => {
    expect(
      citationLabel({ ...SOURCE, document_title: "Project 273", lb_name: "Adat" }),
    ).toBe("Project 273 — Adat, p. 3");
  });

  it("opens the document it came from", async () => {
    const opened = vi.fn();
    render(<MessageBubble message={ANSWER} onSourceClick={opened} />);

    await userEvent.click(
      screen.getByRole("button", { name: /Project 2023-24\/GP\/1147/ }),
    );
    expect(opened).toHaveBeenCalledWith(SOURCE);
  });
});
