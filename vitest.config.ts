import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const stub = fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${src}/` },
      // `server-only` throws outside a React Server environment; tests run in plain Node.
      { find: /^server-only$/, replacement: stub },
    ],
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: { name: "integration", include: ["tests/integration/**/*.test.ts"] },
      },
    ],
  },
});
