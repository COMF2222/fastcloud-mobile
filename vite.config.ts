import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { target: ["chrome89", "safari15"], cssTarget: ["chrome89", "safari15"] },
  server: {
    strictPort: true,
    proxy: {
      "/broker": {
        target: "https://77.223.107.226",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/broker/, ""),
      },
    },
  },
});
