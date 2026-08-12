import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component and page tests. Deliberately separate from vite.config.ts: the dev
// server config carries a Tailwind plugin and an /api proxy, neither of which a
// test should inherit — tests intercept the network at the MSW layer instead,
// and never reach a real backend.
//
// The e2e/ directory belongs to Playwright and is excluded here; running a
// Playwright spec under vitest fails in ways that waste an afternoon.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "e2e"],
    restoreMocks: true,
  },
});
