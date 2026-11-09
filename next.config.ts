import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Hide the Next.js DevTools badge (nextjs-portal) in local preview.
  // It only appears in `next dev` — production never shows it.
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
