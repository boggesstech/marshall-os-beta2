"use client";

import { useEffect } from "react";

const SETTINGS_KEY = "marshall_settings_v1";
const EVT = "marshall:settings-updated";

export const WALLPAPERS = [
  { id: "w1", name: "MAR Waves", url: "/wallpapers/w1.jpg" },
  { id: "w2", name: "BTX Auqa", url: "/wallpapers/w2.png" },
  { id: "w3", name: "Flowing Rock", url: "/wallpapers/w3.jpg" },
  { id: "w4", name: "BTX Aroura", url: "/wallpapers/w4.jpg" },
  { id: "w5", name: "Reflections", url: "/wallpapers/w5.jpg" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];

function applyNow() {
  const fallback = "/wallpapers/w1.jpg";

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : null;
    const wp: WallpaperId = s?.ui?.wallpaper ?? "w1";
    const match = WALLPAPERS.find((x) => x.id === wp) ?? WALLPAPERS[0];

    document.documentElement.style.setProperty("--marshall-bg", `url('${match.url}')`);
    document.documentElement.style.setProperty("--marshall-bg-fallback", "#050607");
  } catch {
    // NEVER nuke it to none — fall back
    document.documentElement.style.setProperty("--marshall-bg", `url('${fallback}')`);
    document.documentElement.style.setProperty("--marshall-bg-fallback", "#050607");
  }
}

export default function ApplyWallpaper() {
  useEffect(() => {
    applyNow();

    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) applyNow();
    };

    const onCustom = () => applyNow();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, onCustom as any);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, onCustom as any);
    };
  }, []);

  return null;
}

/** Call this after saving settings to update wallpaper immediately (same tab) */
export function notifySettingsUpdated() {
  window.dispatchEvent(new Event(EVT));
}