import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins = [react()];

  // Only add lovable-tagger in development mode and if available
  if (mode === 'development') {
    try {
      const { componentTagger } = require("lovable-tagger");
      plugins.push(componentTagger());
    } catch (error) {
      console.log("lovable-tagger not available in development, skipping...");
    }
  }

  return {
    server: {
      host: "::",
      port: 8081,
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
