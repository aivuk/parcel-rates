/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Where the dev server proxies /api: the backend run locally on port 8787 (see README.md). */
export const DEFAULT_API_TARGET = "http://localhost:8787";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = process.env.VITE_API_TARGET || env.VITE_API_TARGET || DEFAULT_API_TARGET;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    test: {
      environment: "jsdom",
      // Playwright specs live in e2e/ and run against a live stack (npm run e2e).
      include: ["src/**/*.test.{ts,tsx}"],
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
