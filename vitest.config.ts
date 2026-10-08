import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js supplies this marker module at build time; there is no installed package.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url))
    }
  },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"]
  }
});
