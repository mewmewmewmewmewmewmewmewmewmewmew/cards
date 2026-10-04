import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For a custom domain, base should be "/" (default). If you deploy under a subpath, set base: "/your-repo/"
// Two pages: the catalog (index.html) and /stats (stats/index.html → dist/stats/index.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        stats: new URL("./stats/index.html", import.meta.url).pathname,
      },
    },
  },
  // base: "/"
});
