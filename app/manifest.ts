import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "MARshall OS",
    short_name: "MARshall",
    description: "Offline-ready shop management for jobs, customers, inventory, billing, service, and resources.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#050607",
    theme_color: "#17243a",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Open the MARshall OS dashboard.",
        url: "/dashboard",
        icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Clock In",
        short_name: "Clock In",
        description: "Start a job session.",
        url: "/clock-in",
        icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Billing",
        short_name: "Billing",
        description: "Open invoices and estimates.",
        url: "/billing",
        icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
