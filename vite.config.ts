import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env / .env.[mode] files so the APP_URL token resolves from env files
  // too (Vercel injects real env vars; local `vite build` reads .env.production).
  const env = loadEnv(mode, process.cwd(), '');
  // APP_URL token for index.html (absolute og:image). Never expose secrets here —
  // only this public value is substituted, via Vite's html transform.
  const appUrl = (process.env.APP_URL ?? env.APP_URL ?? env.VITE_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

  return {
  server: {
    host: "::",
    port: 8081,
  },
  plugins: [
    react(),
    {
      name: 'faqify-app-url-token',
      transformIndexHtml(html) {
        return html.replace(/%APP_URL%/g, appUrl);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
  };
});
