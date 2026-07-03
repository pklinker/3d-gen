import { defineConfig } from "vitest/config";

// Pure data-layer tests only (serializers, merge logic) — no DOM/three.js
// rendering under test, so plain "node" keeps the suite fast with no jsdom dep.
export default defineConfig({
  test: {
    environment: "node",
  },
});
