"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "marshall_pwa_install_dismissed";

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setInstalled(isStandaloneMode());
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      localStorage.removeItem(DISMISSED_KEY);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || dismissed || (!installEvent && !offlineReady)) return null;

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setInstallEvent(null);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="pwaInstall" role="status">
      <div className="copy">
        <strong>{installEvent ? "Install MARshall OS" : "Offline cache ready"}</strong>
        <span>
          {installEvent
            ? "Add it to ChromeOS as an app window."
            : "Reload once online, then Chrome can reopen cached pages offline."}
        </span>
      </div>
      {installEvent && <button onClick={install}>Install</button>}
      <button className="dismiss" onClick={dismiss} aria-label="Dismiss install notice">
        x
      </button>

      <style jsx>{`
        .pwaInstall {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 1000;
          width: min(420px, calc(100vw - 28px));
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 14px;
          background: rgba(8, 14, 24, 0.9);
          color: #eef1f3;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(12px);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        .copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        strong {
          font-size: 14px;
          line-height: 1.2;
        }
        span {
          color: rgba(238, 241, 243, 0.72);
          font-size: 12px;
          line-height: 1.3;
        }
        button {
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          color: #eef1f3;
          cursor: pointer;
          font-weight: 900;
          min-height: 38px;
          padding: 8px 11px;
        }
        .dismiss {
          width: 38px;
          padding: 0;
          background: rgba(255, 255, 255, 0.06);
        }
        @media (max-width: 640px) {
          .pwaInstall {
            left: 14px;
            right: 14px;
            bottom: 14px;
            width: auto;
            grid-template-columns: 1fr auto;
          }
          .copy {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
