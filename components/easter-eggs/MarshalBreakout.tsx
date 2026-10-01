"use client";

import { useEffect, useRef, useState } from "react";

const DISCOVERED = "marshalBreakoutDiscovered";
const COMPLETED = "marshalBreakoutCompleted";
const introduction = [
  ["", 750],
  ["Oh, hello you.", 1900],
  ["Watcha doin'?", 1800],
  ["Ohhhh... you're looking for some sort of Easter egg, aren't you?", 3300],
  ["Well, there isn't one.", 2200],
  ["", 2600],
  ["Well... on second thought.", 2200],
  ["Why don't I give you one?", 2100],
  ["Something fun.", 1700],
  ["Something special.", 1900],
  ["", 700],
] as const;

function readFlag(key: string) {
  try { return localStorage.getItem(key) === "true"; } catch { return false; }
}

function writeFlag(key: string) {
  try { localStorage.setItem(key, "true"); } catch { /* Play remains available when storage is unavailable. */ }
}

export default function MarshalBreakout() {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("intro");
  const [line, setLine] = useState(0);
  const [repeatWin, setRepeatWin] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (active) return;
    let buffer = "";
    let lastKey = 0;
    const listen = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing ||
        target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox'], [role='combobox'], [role='dialog'], dialog")) {
        buffer = "";
        return;
      }
      if (!/^[a-z]$/i.test(event.key)) { buffer = ""; return; }
      if (Date.now() - lastKey > 1500) buffer = "";
      lastKey = Date.now();
      buffer = (buffer + event.key.toLowerCase()).slice(-5);
      if (buffer !== "hello") return;
      buffer = "";
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const discovered = readFlag(DISCOVERED);
      writeFlag(DISCOVERED);
      setLine(0);
      setPhase(discovered ? "return" : "intro");
      setActive(true);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = Array.from(overlay.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay.current)
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of background) element.inert = true;
    overlay.current?.focus();
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setActive(false); }
      if (event.key === "Tab") {
        const buttons = overlay.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) { event.preventDefault(); return; }
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === overlay.current)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", exit);
    return () => {
      document.body.style.overflow = savedOverflow;
      for (const { element, inert } of background) element.inert = inert;
      window.removeEventListener("keydown", exit);
      previousFocus.current?.focus();
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    if (phase === "intro") {
      timer = window.setTimeout(() => {
        if (line + 1 === introduction.length) setPhase("game");
        else setLine(line + 1);
      }, introduction[line][1]);
    } else if (phase === "again") timer = window.setTimeout(() => setPhase("game"), 1500);
    else if (phase === "winPause") timer = window.setTimeout(() => setPhase("win"), 1800);
    return () => window.clearTimeout(timer);
  }, [active, phase, line]);

  if (!active) return null;
  const close = () => setActive(false);
  return (
    <div ref={overlay} className="takeover" role="dialog" aria-modal="true" aria-label="Marshal arcade" tabIndex={-1}>
      {phase === "game" ? <Breakout onFinish={(won) => {
        setRepeatWin(readFlag(COMPLETED));
        if (won) writeFlag(COMPLETED);
        setPhase(won ? "winPause" : "lost");
      }} /> : <div className="message" key={`${phase}-${line}`} aria-live="polite">
        {phase === "intro" && <p>{introduction[line][0]}</p>}
        {phase === "return" && <><p>Oh. You again.</p><button onClick={() => setPhase("again")}>Breakout.</button></>}
        {phase === "again" && <p>Yeah, yeah.</p>}
        {phase === "lost" && <><p>Well, that was productive.</p><button onClick={close}>Return to work</button></>}
        {phase === "winPause" && <p>...</p>}
        {phase === "win" && <><p>{repeatWin ? "...again?" : "You actually finished it?"}</p><button onClick={() => setPhase("reward")}>Yep.</button></>}
        {phase === "reward" && <><p>{repeatWin ? "You know we have actual work to do, right?" : "I genuinely didn't plan this far ahead."}</p><button onClick={repeatWin ? close : () => { writeFlag(COMPLETED); setPhase("achievement"); }}>{repeatWin ? "Return to work" : "Give me something."}</button></>}
        {phase === "achievement" && <><p>🏆 Company Time Well Spent</p><button onClick={close}>Return to work</button></>}
      </div>}
      <style jsx>{`
        .takeover { position: fixed; inset: 0; z-index: 10000; background: #000; color: #fff; display: grid; place-items: center; padding: 24px; outline: none; animation: arrive 450ms ease both; }
        .message { text-align: center; max-width: 760px; animation: arrive 400ms ease both; }
        p { font-size: 26px; line-height: 1.5; margin: 0 0 28px; }
        button { font: inherit; color: #fff; background: transparent; border: 1px solid #777; border-radius: 4px; padding: 12px 24px; cursor: pointer; }
        button:hover { background: #202020; }
        button:focus-visible { outline: 2px solid #a7d9df; outline-offset: 5px; }
        @keyframes arrive { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .takeover, .message { animation: none; } }
      `}</style>
    </div>
  );
}

function Breakout({ onFinish }: { onFinish: (won: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const width = 800, height = 560, paddleWidth = 110, radius = 7;
    let paddle = width / 2, x = width / 2, y = height - 75, vx = 155, vy = -260;
    let score = 0, lives = 3, previous = 0, launchAt = performance.now() + 1000, frame = 0, finished = false;
    const keys = new Set<string>();
    const bricks = Array.from({ length: 50 }, (_, i) => ({ x: 30 + (i % 10) * 75, y: 70 + Math.floor(i / 10) * 30, alive: true }));
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(event.key.toLowerCase()) || ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); keys.add(event.key.toLowerCase());
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const blur = () => { keys.clear(); previous = 0; };
    const pointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      paddle = Math.max(paddleWidth / 2, Math.min(width - paddleWidth / 2, (event.clientX - rect.left) / rect.width * width));
    };
    const finish = (won: boolean) => { finished = true; onFinish(won); };
    const update = (dt: number) => {
      if (keys.has("arrowleft") || keys.has("a")) paddle -= 470 * dt;
      if (keys.has("arrowright") || keys.has("d")) paddle += 470 * dt;
      paddle = Math.max(paddleWidth / 2, Math.min(width - paddleWidth / 2, paddle));
      const oldY = y;
      x += vx * dt; y += vy * dt;
      if (x < radius || x > width - radius) { x = Math.max(radius, Math.min(width - radius, x)); vx = -vx; }
      if (y < radius + 38) { y = radius + 38; vy = Math.abs(vy); }
      if (vy > 0 && oldY + radius <= height - 35 && y + radius >= height - 35 && Math.abs(x - paddle) <= paddleWidth / 2 + radius) {
        y = height - 35 - radius;
        const angle = (x - paddle) / (paddleWidth / 2) * 1.05;
        const speed = Math.min(440, Math.hypot(vx, vy) + 6);
        vx = Math.sin(angle) * speed; vy = -Math.cos(angle) * speed;
      }
      for (const brick of bricks) {
        if (!brick.alive || x + radius < brick.x || x - radius > brick.x + 66 || y + radius < brick.y || y - radius > brick.y + 20) continue;
        brick.alive = false; score += 10;
        if (oldY + radius <= brick.y || oldY - radius >= brick.y + 20) vy = -vy;
        else vx = -vx;
        if (bricks.every((b) => !b.alive)) finish(true);
        break;
      }
      if (y > height + radius) {
        lives--;
        if (!lives) { finish(false); return; }
        x = paddle; y = height - 75; vx = 155; vy = -260; launchAt = performance.now() + 900;
      }
    };
    const draw = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.035) : 0;
      previous = now;
      if (now >= launchAt && !document.hidden) {
        // Small substeps keep the ball from crossing a brick between collision checks.
        const steps = Math.max(1, Math.ceil(dt / 0.005));
        for (let i = 0; i < steps && !finished; i++) update(dt / steps);
      }
      context.fillStyle = "#000"; context.fillRect(0, 0, width, height);
      context.font = "16px system-ui"; context.fillStyle = "#e8eaed";
      context.fillText(`Score ${score}`, 30, 27); context.fillText(`Lives ${lives}`, width - 100, 27);
      const colors = ["#e8eaed", "#a7d9df", "#7eb8c5", "#d3b971", "#acb7bd"];
      for (const [i, brick] of bricks.entries()) {
        if (!brick.alive) continue;
        context.fillStyle = colors[Math.floor(i / 10)]; context.fillRect(brick.x, brick.y, 66, 20);
      }
      context.fillStyle = "#e8eaed"; context.fillRect(paddle - paddleWidth / 2, height - 35, paddleWidth, 10);
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      if (!finished) frame = requestAnimationFrame(draw);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    element.addEventListener("pointermove", pointer);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      element.removeEventListener("pointermove", pointer);
    };
  }, [onFinish]);
  return <><canvas ref={canvas} width={800} height={560} aria-label="Arcade game. Move with Left and Right arrows, A and D, or your pointer. Escape returns to the dashboard." /><style jsx>{`canvas { display: block; width: min(100%, 1000px, calc((100dvh - 48px) * 1.42857)); height: auto; aspect-ratio: 10 / 7; touch-action: none; }`}</style></>;
}
