"use client";

import { useEffect } from "react";

const APP_ROUTES = [
  "/",
  "/offline",
  "/dashboard",
  "/clock-in",
  "/jobs",
  "/billing",
  "/customers",
  "/inventory",
  "/service",
  "/resources",
  "/settings",
];

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "WARM_APP_SHELL", routes: APP_ROUTES });
      } catch {
        // PWA install should never block the app itself.
      }
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
