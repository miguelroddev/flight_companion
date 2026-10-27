import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    // 5173 belongs to the outrora project. Strict, so a clash is an error
    // rather than a silent move to another port, or the same port on the
    // other IP family.
    port: 5174,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      // Inside Docker Compose the backend is reachable as "backend";
      // running Vite directly on the host, it's on localhost
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000",
    },
  },
});
