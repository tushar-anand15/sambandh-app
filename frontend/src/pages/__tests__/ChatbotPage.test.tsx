/**
 * The assistant is a shell, and this is the test that says so.
 *
 * The revamp turned it into a scrolling document, and nothing failed: every
 * component still rendered, every string was still on the page, and the
 * composer had simply walked off the bottom of the screen. So the structure is
 * asserted here — one element that scrolls, a composer that is not inside it,
 * and a document that does not scroll behind them — rather than left to
 * whoever next opens the page.
 *
 * GS's copy is asserted verbatim for the same reason. It is his sentence, and
 * a paraphrase of it would pass a looser test.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import ChatbotPage from "../ChatbotPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import { AuthProvider } from "@/hooks/useAuth";
import { server } from "@/test/setup";

const INDEX = {
  districts: ["Thrissur"],
  years: ["2025-2026"],
  documents: 1055,
  local_bodies: [
    {
      lb_name: "Adat Grama Panchayat",
      lb_type: "Grama Panchayat",
      district_name: "Thrissur",
      documents: 41,
    },
  ],
};

function mountAssistant() {
  server.use(http.get("*/api/documents/filters", () => HttpResponse.json(INDEX)));

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/ask"]}>
        <Routes>
          <Route path="/ask" element={<DashboardLayout />}>
            <Route index element={<ChatbotPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("the assistant shell", () => {
  it("carries GS's copy, verbatim", async () => {
    mountAssistant();

    expect(
      screen.getByRole("heading", { name: "Reading the project documents" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Ask it about a project you saw in the explorer in words, in English or Malayalam, and the assistant answers from the sanctioning documents it has read, quoting the project number and local body each answer comes from\. It answers only from those documents\./,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Assistant library is far smaller than the rest of the site and is a strict prototype\./,
      ),
    ).toBeInTheDocument();
  });

  it("puts the composer outside the thing that scrolls", async () => {
    const { container } = mountAssistant();

    const input = screen.getByLabelText("Ask about a project");
    const scroller = container.querySelector('[class*="stream"]');

    expect(scroller).not.toBeNull();
    // The failure this catches: the composer sitting inside the transcript,
    // which is what puts it below the fold as soon as an answer arrives.
    expect(scroller!.contains(input)).toBe(false);
  });

  it("keeps the document behind it still", async () => {
    mountAssistant();
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
  });

  it("keeps New chat and the two panels reachable", async () => {
    mountAssistant();

    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Past conversations" }),
    ).toBeInTheDocument();
  });

  it("offers only the local bodies the assistant has read", async () => {
    mountAssistant();

    const select = await screen.findByRole("combobox");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Adat Grama Panchayat (41 documents)" }),
      ).toBeInTheDocument(),
    );
    expect(select).toBeInTheDocument();
  });
});
