/**
 * The report form, driven through the footer trigger that opens it.
 *
 * Two claims carry the file. The first is keyboard behaviour: a modal that
 * leaks focus to the page behind it, or that drops focus at the top of the
 * document when it closes, is unusable without a mouse. The second is what
 * happens when the send fails — the dialog stays up with the text in it, so a
 * reader can try again without retyping a paragraph about a wrong figure.
 *
 * The API is answered by MSW handlers registered here rather than in
 * `src/test/handlers.ts`: they exist for this file only, and `setup.ts` runs
 * `server.resetHandlers()` after each test.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import SiteFooter from "../SiteFooter";
import { server } from "@/test/setup";

const TOKEN = { issued_at: 1_760_000_000, signature: "a".repeat(64) };

function tokenIssued() {
  return http.get("/api/report/token", () => HttpResponse.json(TOKEN));
}

async function openDialog() {
  const user = userEvent.setup();
  render(<SiteFooter />);

  const trigger = screen.getByRole("button", { name: "Report an error" });
  await user.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: "Report an error" });
  return { user, trigger, dialog };
}

beforeEach(() => {
  server.use(tokenIssued());
});

describe("the report form", () => {
  it("is closed until the footer trigger is used, and asks for nothing before then", () => {
    render(<SiteFooter />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report an error" })).toBeInTheDocument();
  });

  it("says what a useful report contains", async () => {
    const { dialog } = await openDialog();

    expect(dialog).toHaveTextContent(/names the local body and the year/i);
    expect(within(dialog).getByLabelText("Subject")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What is wrong")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send report" })).toBeInTheDocument();
  });

  it("hides the honeypot from sight and from assistive technology", async () => {
    const { dialog } = await openDialog();

    // Out of the accessibility tree: a role query is the one that respects
    // aria-hidden, which is what a screen reader does too.
    expect(within(dialog).queryByRole("textbox", { name: "Website" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);

    const honeypot = dialog.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps Tab inside the panel", async () => {
    const { user, dialog } = await openDialog();

    const stops = ["Subject", "What is wrong"].map((label) =>
      within(dialog).getByLabelText(label),
    );
    const close = within(dialog).getByRole("button", { name: "Close" });
    const send = within(dialog).getByRole("button", { name: "Send report" });

    // From the panel forward through every control, then round to the first.
    for (const stop of [...stops, close, send]) {
      await user.tab();
      expect(stop).toHaveFocus();
    }
    await user.tab();
    expect(stops[0]).toHaveFocus();

    // And backwards off the first control, which must not land in the footer.
    await user.tab({ shift: true });
    expect(send).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user, trigger } = await openDialog();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on the Close button and returns focus to the trigger", async () => {
    const { user, trigger, dialog } = await openDialog();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("sends the signed timestamp the API issued, and reports what the mail service said", async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/report", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ sent: true });
      }),
    );

    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText("Subject"), "Wrong project total");
    await user.type(
      within(dialog).getByLabelText("What is wrong"),
      "Chalakudy Municipality, 2023-24.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The mail service accepted the report for delivery.",
    );
    // Accepted for delivery is all a request can know, so it is all the form says.
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/arrived|delivered to/i);

    await waitFor(() => expect(received).not.toBeNull());
    expect(received).toMatchObject({
      subject: "Wrong project total",
      message: "Chalakudy Municipality, 2023-24.",
      website: "",
      issued_at: TOKEN.issued_at,
      signature: TOKEN.signature,
    });
  });

  it("keeps the dialog open with the text intact when the send fails", async () => {
    server.use(
      http.post("/api/report", () =>
        HttpResponse.json(
          { detail: "The report did not send. Try again in a few minutes." },
          { status: 502 },
        ),
      ),
    );

    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText("Subject"), "Wrong project total");
    await user.type(
      within(dialog).getByLabelText("What is wrong"),
      "Chalakudy Municipality, 2023-24: two projects missing.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The report did not send. Try again in a few minutes.");
    expect(alert.textContent).not.toMatch(/!|sorry/i);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("Wrong project total");
    expect(screen.getByLabelText("What is wrong")).toHaveValue(
      "Chalakudy Municipality, 2023-24: two projects missing.",
    );
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });

  it("shows the reason the API gave when the form has expired", async () => {
    server.use(
      http.post("/api/report", () =>
        HttpResponse.json(
          {
            detail:
              "The form expired 15 minutes after it opened. Reload the page and send the report again.",
          },
          { status: 422 },
        ),
      ),
    );

    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText("What is wrong"), "A figure is wrong.");
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The form expired 15 minutes after it opened. Reload the page and send the report again.",
    );
  });

  it("says the form could not be prepared when the timestamp request fails", async () => {
    server.use(http.get("/api/report/token", () => HttpResponse.json({}, { status: 500 })));

    await openDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The form could not be prepared. Reload the page and open it again.",
    );
  });
});
