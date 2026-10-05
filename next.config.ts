import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is a client-side Firebase app with no server code, so it exports
  // to plain static files and is served from Firebase Hosting's free tier.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
