import type { MetadataRoute } from "next";

/** Web app manifest: name, colours and icons for "Add to home screen" (npm run app-icons). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quest Board",
    short_name: "Quest Board",
    description: "Book seats at tabletop RPG games run by Game Masters across Indonesia.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6ead0",
    theme_color: "#2a1a0e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
