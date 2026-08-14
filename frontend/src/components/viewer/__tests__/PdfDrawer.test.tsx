/**
 * The drawer, on its own terms.
 *
 * `FinancesSection.test.tsx` covers opening one from a project row. What is
 * tested here is what any section reusing it can rely on: it is a modal dialog,
 * Escape and the backdrop close it, and an absent address produces a stated
 * cause rather than an empty panel.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PdfDrawer from "../PdfDrawer";

// pdf.js draws onto a canvas and reaches for DOMMatrix, which jsdom does not
// implement. The page it renders is not a thing a DOM test can assert on
// anyway; what the drawer owes its caller is the address it hands to the
// renderer, so the renderer is replaced by something that prints it.
vi.mock("../PdfPages", () => ({
  default: ({ url }: { url: string }) => <p data-testid="pdf-pages">{url}</p>,
}));

const URL_ =
  "https://storage.googleapis.com/sulekhasakarma-pdfs/pdfs/2023-2024/x/1.pdf?X-Goog-Signature=abc";

describe("PdfDrawer", () => {
  it("renders nothing while closed", () => {
    render(<PdfDrawer open={false} title="A project" url={URL_} onClose={vi.fn()} />);
    expect(screen.queryByTestId("pdf-drawer")).not.toBeInTheDocument();
  });

  it("is a modal dialog labelled by the document it holds", () => {
    render(<PdfDrawer open title="A project" subtitle="Project 1" url={URL_} onClose={vi.fn()} />);

    const drawer = screen.getByRole("dialog", { name: "A project" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Project 1")).toBeInTheDocument();
  });

  it("puts focus on the close button when it opens", () => {
    render(<PdfDrawer open title="A project" url={URL_} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes on Escape, on the backdrop and on the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PdfDrawer open title="A project" url={URL_} onClose={onClose} />);

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("drawer-backdrop"));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("states the cause where there is no address, and offers no link", () => {
    render(
      <PdfDrawer
        open
        title="A project"
        url={null}
        unavailableReason="This deployment holds no signing key."
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("This deployment holds no signing key.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the document and offers it in a new tab", async () => {
    render(<PdfDrawer open title="A project" url={URL_} onClose={vi.fn()} />);

    expect(await screen.findByTestId("pdf-pages")).toHaveTextContent(URL_);
    const link = screen.getByRole("link", { name: "Open the document in a new tab" });
    expect(link).toHaveAttribute("href", URL_);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
