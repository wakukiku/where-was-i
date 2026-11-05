import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Where Was I?",
        short_name: "Where Was I?",
        description: "Локальный трекер контекста для игр, сериалов и книг.",
        theme_color: "#b8ff3d",
        background_color: "#f7f0e7",
        display: "standalone",
        lang: "ru",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/(api\.tvmaze\.com|openlibrary\.org|www\.wikidata\.org|[a-z-]+\.wikipedia\.org)\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "catalog-search",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 604800 },
            },
          },
          {
            urlPattern:
              /^https:\/\/(covers\.openlibrary\.org|static\.tvmaze\.com|commons\.wikimedia\.org|upload\.wikimedia\.org|thumb\.wikimedia\.org)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "catalog-images",
              expiration: { maxEntries: 120, maxAgeSeconds: 2592000 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    fileParallelism: false,
  },
});
