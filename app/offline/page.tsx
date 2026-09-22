"use client";

import Link from "next/link";
import ApplyWallpaper from "@/components/ApplyWallpaper";

export default function OfflinePage() {
  return (
    <main className="wrap">
      <ApplyWallpaper />
      <section className="panel">
        <img src="/marshall-os.svg" alt="MARshall OS" />
        <div className="micro">OFFLINE MODE</div>
        <h1>You are offline.</h1>
        <p>
          MARshall OS can reopen pages that were cached on this device. If a section is not available
          yet, reconnect once and open it again so Chrome can save it for offline use.
        </p>
        <div className="actions">
          <Link className="btn primary" href="/dashboard">Dashboard</Link>
          <Link className="btn" href="/">Start Screen</Link>
        </div>
      </section>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          padding: 24px;
          color: #eef1f3;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          background-color: var(--marshall-bg-fallback, #050607);
          background-image: linear-gradient(rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0.42)), var(--marshall-bg);
          background-size: cover;
          background-position: center;
          display: grid;
          place-items: center;
        }
        .panel {
          width: min(680px, 100%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          background: rgba(5, 8, 14, 0.78);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
          backdrop-filter: blur(12px);
          padding: 28px;
          display: grid;
          gap: 14px;
        }
        img {
          width: min(320px, 78vw);
          height: auto;
        }
        .micro {
          margin-top: 8px;
          color: rgba(238, 241, 243, 0.68);
          font-size: 12px;
          letter-spacing: 2px;
          font-weight: 900;
        }
        h1 {
          margin: 0;
          font-size: clamp(36px, 7vw, 64px);
          line-height: 0.95;
        }
        p {
          margin: 0;
          max-width: 560px;
          color: rgba(238, 241, 243, 0.76);
          line-height: 1.45;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .btn {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: #eef1f3;
          padding: 11px 13px;
          font-weight: 950;
          text-decoration: none;
        }
        .primary {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </main>
  );
}
