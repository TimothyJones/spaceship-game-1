import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The game API. Run it with `npm run dev:be` (space-be/src/local-server.js).
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
