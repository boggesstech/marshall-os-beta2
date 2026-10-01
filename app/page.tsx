"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "ready" | "booting";
type BootMessage = { title: string; roll: string };

const COMPLETE_KEY = "marshall_setupComplete";
const DEFAULT_BOOT_MESSAGE: BootMessage = { title: "Ready to rock?", roll: "Let's roll." };
const BOOT_MESSAGES: BootMessage[] = [
  DEFAULT_BOOT_MESSAGE,
  { title: "Paint!", roll: "Paint!" },
  { title: "For those about to paint,", roll: "We salute you." },
  { title: "Who's ready to paint!", roll: "You are!" },
  { title: "Don't put paint in the fridge.", roll: "It makes everything taste like paint." },
  { title: "Painter?", roll: "I hardly know her!" },
  { title: "Did you wash your hands?", roll: "Seriously, did you?" },
  { title: "Spread love!", roll: "" },
  { title: "I see a red door.", roll: "And I want it painted black." },
  { title: "Could you paint me a Birmingham?", roll: "" },
  { title: "We been spendin' most our lives", roll: "Livin' in a painters paradise." },
  { title: "Dude, have you checked the humidity?", roll: "'Cause I haven't. Just askin'." },
  { title: "Cause we are living in a body shop world!", roll: "And I am a body shop girl!" },
];
const RARE_BOOT_MESSAGES: BootMessage[] = [
  { title: "Aw heck naw!", roll: "" },
  { title: "Don't you have better things to do?", roll: "" },
];

function randomBootMessage() {
  if (Math.random() < 0.01) {
    return RARE_BOOT_MESSAGES[Math.floor(Math.random() * RARE_BOOT_MESSAGES.length)] ?? DEFAULT_BOOT_MESSAGE;
  }
  return BOOT_MESSAGES[Math.floor(Math.random() * BOOT_MESSAGES.length)] ?? DEFAULT_BOOT_MESSAGE;
}

export default function Home() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [canSkip, setCanSkip] = useState(false);
  const [bootMessage, setBootMessage] = useState<BootMessage>(DEFAULT_BOOT_MESSAGE);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const skipTimerRef = useRef<number | null>(null);
  const navigatedRef = useRef(false);
  const forceDashboardRef = useRef(false);

  const goNext = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    // Stop timers/media
    if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    if (skipTimerRef.current) window.clearTimeout(skipTimerRef.current);
    try {
      videoRef.current?.pause();
      audioRef.current?.pause();
    } catch {}

    const setupDone = forceDashboardRef.current || localStorage.getItem(COMPLETE_KEY) === "true";
    router.push(setupDone ? "/dashboard" : "/setup");
  };

  // Play media AFTER boot screen mounts
  useEffect(() => {
    if (phase !== "booting") return;
    navigatedRef.current = false;

    const start = async () => {
      // Allow skip shortly after start
      skipTimerRef.current = window.setTimeout(() => setCanSkip(true), 900);

      // Start video
      const v = videoRef.current;
      if (v) {
        v.currentTime = 0;
        v.muted = true; // keep muted; we use separate boot audio file
        v.playsInline = true;

        try {
          await v.play();
        } catch {
          // If video fails (codec/policy), give the user a moment to see the boot screen.
          fallbackTimerRef.current = window.setTimeout(goNext, 12000);
        }
      }

      // Start audio (must be triggered by user gesture; phase is set from a click)
      audioRef.current = new Audio("/boot/boot-sound.mp3");
      audioRef.current.preload = "auto";
      try {
        await audioRef.current.play();
      } catch {
        // Audio may fail silently if the browser blocks it; video still runs
      }

      // Fallback only if the ended event never arrives. Use the actual media duration when available.
      if (v) {
        const durationSeconds = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 30;
        fallbackTimerRef.current = window.setTimeout(goNext, Math.ceil(Math.max(durationSeconds + 3, 120) * 1000));
      }
    };

    start();

    return () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      if (skipTimerRef.current) window.clearTimeout(skipTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Skip key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "booting" && canSkip && (e.key === "s" || e.key === "S")) {
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, canSkip]);

  const startBoot = () => {
    if (phase !== "ready") return;
    setPhase("booting");
  };

  useEffect(() => {
    setBootMessage(randomBootMessage());
    const bootFromInventory = new URLSearchParams(window.location.search).get("marshalInventoryBoot") === "1";
    if (bootFromInventory) {
      forceDashboardRef.current = true;
      setPhase("booting");
    }
  }, []);

  return (
    <main className="root">
      {phase === "ready" ? (
        <button className="ready" onClick={startBoot}>
          <span className="ambientGrid" />
          <span className="readyTop">
            <img className="mark" src="/marshall-os.svg" alt="MARshall OS" />
            <span className="statusPill"><span className="pulse" />System Ready</span>
          </span>

          <span className="readyBody">
            <span>
              <span className="eyebrow">Shop command center</span>
              <span className="title">{bootMessage.title}</span>
              {bootMessage.roll && <span className="roll">{bootMessage.roll}</span>}
            </span>
            <span className="cta">Start MARshall OS</span>
          </span>

          <span className="readyFooter">
            <span>BTX 2026</span>
            <span>V2.0.4</span>
            <span>Local browser storage</span>
          </span>
        </button>
      ) : (
        <div className="bootWrap">
          <video
            ref={videoRef}
            className="bootVideo"
            src="/boot/boot.mp4"
            playsInline
            preload="auto"
            muted
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onEnded={goNext}
          />

          {/* Retro-industrial overlay */}
          <div className="overlay">
            <div className="noise" />
            <div className="scanlines" />

            <div className="corner">
              <div className="micro">BOOT SEQUENCE</div>
              <div className="micro dim">MAR CORE: ONLINE</div>
            </div>

            <div className="skip">{canSkip ? "Press S to skip" : ""}</div>
          </div>
        </div>
      )}

      <style jsx>{`
        .root {
          min-height: 100vh;
          background:
            linear-gradient(135deg, rgba(7, 12, 18, 0.96), rgba(13, 31, 54, 0.88)),
            url("/wallpapers/w1.jpg");
          background-size: cover;
          background-position: center;
          color: #e8eaed;
          display: grid;
          place-items: center;
          overflow: hidden;
          font-family: system-ui, -apple-system, Segoe UI, Roboto;
          padding: 0;
        }

        .ready {
          position: relative;
          overflow: hidden;
          width: 100vw;
          min-height: 100vh;
          border: 0;
          background: rgba(4, 9, 15, 0.76);
          border-radius: 0;
          padding: clamp(22px, 4vw, 54px);
          text-align: left;
          cursor: pointer;
          color: #eef1f3;
          display: grid;
          align-content: space-between;
          gap: 36px;
          box-shadow: none;
          backdrop-filter: blur(12px);
          isolation: isolate;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }
        .ready:hover {
          transform: none;
          border-color: rgba(255, 255, 255, 0.28);
          background: rgba(6, 13, 22, 0.78);
        }
        .ambientGrid {
          position: absolute;
          inset: 0;
          z-index: -1;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(90deg, black, transparent 75%);
          opacity: 0.26;
        }
        .readyTop,
        .readyFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .mark {
          width: min(280px, 42vw);
          height: 112px;
          object-fit: contain;
          object-position: left center;
          filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.42));
        }
        .micro,
        .eyebrow {
          display: block;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(238, 241, 243, 0.62);
          font-weight: 950;
        }
        .statusPill {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(150, 220, 255, 0.26);
          background: rgba(120, 190, 235, 0.10);
          border-radius: 999px;
          padding: 10px 13px;
          font-size: 13px;
          font-weight: 950;
        }
        .pulse {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #bfe7ff;
          box-shadow: 0 0 0 5px rgba(191, 231, 255, 0.12);
        }
        .readyBody {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          gap: 28px;
        }
        .title {
          display: block;
          margin-top: 12px;
          font-size: clamp(64px, 9vw, 118px);
          font-weight: 950;
          line-height: 0.88;
          letter-spacing: 0;
          max-width: 760px;
        }
        .roll {
          display: block;
          margin-top: 12px;
          color: rgba(238, 241, 243, 0.78);
          font-size: clamp(30px, 4vw, 52px);
          line-height: 1;
          font-weight: 950;
        }
        .cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          justify-self: end;
          min-height: 50px;
          min-width: 230px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          color: #ffffff;
          font-weight: 1000;
        }
        .readyFooter {
          color: rgba(238, 241, 243, 0.52);
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .bootWrap {
          position: relative;
          width: 100vw;
          height: 100vh;
          background:
            radial-gradient(circle at center, rgba(24, 42, 64, 0.38), transparent 58%),
            #050607;
          overflow: hidden;
          display: grid;
          place-items: center;
        }

        .bootVideo {
          width: 100vw;
          height: 100vh;
          max-width: 100vw;
          max-height: 100vh;
          object-fit: contain;
          display: block;
          filter: contrast(1.05) brightness(0.95);
        }

        .overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .noise {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E");
          opacity: 0.10;
          mix-blend-mode: overlay;
        }

        .scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.03),
            rgba(255, 255, 255, 0.03) 1px,
            rgba(0, 0, 0, 0) 4px,
            rgba(0, 0, 0, 0) 8px
          );
          opacity: 0.10;
          mix-blend-mode: overlay;
        }

        .corner {
          position: absolute;
          top: 18px;
          left: 18px;
        }
        .micro {
          font-size: 12px;
          letter-spacing: 2px;
          opacity: 0.75;
        }
        .dim {
          opacity: 0.45;
          margin-top: 6px;
        }

        .skip {
          position: absolute;
          bottom: 22px;
          right: 22px;
          font-size: 12px;
          opacity: 0.55;
        }

        @media (max-width: 760px) {
          .root {
            padding: 0;
          }
          .ready {
            min-height: 100vh;
            padding: 18px;
          }
          .readyBody {
            grid-template-columns: 1fr;
          }
          .title {
            font-size: 60px;
          }
          .mark {
            width: min(220px, 58vw);
            height: 84px;
          }
          .cta {
            justify-self: stretch;
          }
        }
      `}</style>
    </main>
  );
}
