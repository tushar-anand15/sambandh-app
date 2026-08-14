/**
 * Global test setup: jest-dom matchers, and one MSW server for the whole run.
 *
 * `onUnhandledRequest: "error"` is the point of the file. A component that
 * calls an endpoint nobody wrote a handler for fails the test naming the URL,
 * rather than hanging or silently rendering an empty state — which is how a
 * payload change slips through a green suite.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

import { baseHandlers } from "./handlers";
import { handlers as electionsHandlers } from "./handlers.elections";
import { handlers as financesHandlers } from "./handlers.finances";
import { handlers as meetingsHandlers } from "./handlers.meetings";

export const server = setupServer(
  ...baseHandlers,
  ...financesHandlers,
  ...meetingsHandlers,
  ...electionsHandlers,
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());

// jsdom implements neither, and both are reached by chart and map components.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver;
}
