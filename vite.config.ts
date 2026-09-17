import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
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
