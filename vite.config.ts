import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For a custom domain, base should be "/" (default). If you deploy under a subpath, set base: "/your-repo/"
export default defineConfig({
  plugins: [react()],
  // base: "/"
});
