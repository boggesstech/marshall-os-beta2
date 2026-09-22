import type { Metadata } from "next";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARshall OS",
  description: "Shop management system for Miles Auto Refinishing",
  applicationName: "MARshall OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MARshall OS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/app-icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
  <head>
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function() {
  var map = {
    w1: "/wallpapers/w1.jpg",
    w2: "/wallpapers/w2.png",
    w3: "/wallpapers/w3.jpg",
    w4: "/wallpapers/w4.jpg",
    w5: "/wallpapers/w5.jpg"
  };

  // Always default to something real
  var url = map.w1;

  try {
    var raw = localStorage.getItem("marshall_settings_v1");
    var s = raw ? JSON.parse(raw) : null;
    var wp = (s && s.ui && s.ui.wallpaper) ? s.ui.wallpaper : "w1";
    url = map[wp] || map.w1;
  } catch(e) {
    url = map.w1;
  }

  document.documentElement.style.setProperty("--marshall-bg", "url('" + url + "')");
  document.documentElement.style.setProperty("--marshall-bg-fallback", "#050607");
})();
        `,
      }}
    />
  </head>

      <body>
        <PwaRegister />
        <PwaInstallPrompt />
        {children}
      </body>
    </html>
  );
}
