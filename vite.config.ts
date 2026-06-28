import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { saveFilesPlugin } from "./vite-plugin-savefiles";

export default defineConfig({
  plugins: [react(), saveFilesPlugin()],
  server: { port: 5180, open: true },
});
