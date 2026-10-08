import type { MetadataRoute } from "next";

/**
 * This project builds with `output: "export"`, which cannot serve a dynamic
 * route. The manifest is the same for every visitor, so pinning it to static
 * is both required and correct.
 */
export const dynamic = "force-static";

/**
 * PWA manifest. The icons are the same MyPlanScheduler artwork the Android,
 * iOS, macOS and Windows builds use, so an installed web app looks like the
 * native ones rather than like a default template.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyPlanScheduler",
    short_name: "MyPlanScheduler",
    description: "Plan Today · Do More · Live Better",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1014",
    theme_color: "#6c5ce7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
