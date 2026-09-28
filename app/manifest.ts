import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "Psipedia Admin",
    short_name: "Psipedia",
    description: "Redakčná aplikácia Psipedia.sk",
    start_url: "/admin",
    scope: "/admin/",
    display: "standalone",
    background_color: "#fffdf8",
    theme_color: "#174b38",
    lang: "sk",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
