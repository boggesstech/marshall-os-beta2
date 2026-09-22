"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { KEYS, loadJSON, saveJSON } from "@/lib/marStorage";
import {
  defaultSetupSettings,
  loadSetupSettings,
  normalizeServiceCounters,
  saveSetupSettings,
  todayISO,
  type CounterId,
  type Reminder,
  type Settings,
} from "@/lib/setupData";

type Runtime = {
  sprayHours?: number;
  boothHours?: number;
  suppliedAirHours?: number;
  weldSandHours?: number;
  devilbissHours?: number;
  customCounterHours?: Record<string, number>;
};

type ServiceTone = "due" | "warn" | "ok" | "disabled";
type Notice = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warn" | "danger";
  createdISO: string;
};

type FilterMode = "all" | "due" | "warn" | "ok" | "disabled";

const runtimeMap: Record<CounterId, keyof Runtime> = {
  spray_hours: "sprayHours",
  supplied_air_hours: "suppliedAirHours",
  weld_sand_hours: "weldSandHours",
};

function runtimeValue(runtime: Runtime, counterId?: CounterId) {
  if (!counterId) return 0;
  const mapped = runtimeMap[counterId];
  return Number(mapped ? runtime[mapped] ?? 0 : runtime.customCounterHours?.[counterId] ?? 0);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function shortDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusFor(reminder: Reminder, runtime: Runtime, now: Date): {
  tone: ServiceTone;
  label: string;
  progress: number;
  detail: string;
  remainingText: string;
} {
  if (!reminder.enabled) {
    return { tone: "disabled" as ServiceTone, label: "Disabled", progress: 0, detail: "Not being tracked.", remainingText: "Off" };
  }

  if (reminder.trigger === "hours") {
    const current = runtimeValue(runtime, reminder.counterId);
    const baseline = Number(reminder.lastCounterValue ?? 0);
    const used = Math.max(0, current - baseline);
    const remaining = reminder.limitValue - used;
    const progress = reminder.limitValue > 0 ? Math.min(100, Math.max(0, used / reminder.limitValue) * 100) : 100;
    const tone: ServiceTone = remaining <= 0 ? "due" : remaining <= reminder.warnValue ? "warn" : "ok";
    return {
      tone,
      label: tone === "due" ? "Due now" : tone === "warn" ? "Warning" : "OK",
      progress,
      detail: `${used.toFixed(1)} of ${reminder.limitValue} hr used`,
      remainingText: remaining <= 0 ? `${Math.abs(remaining).toFixed(1)} hr overdue` : `${remaining.toFixed(1)} hr left`,
    };
  }

  const serviced = new Date(reminder.lastServicedAtISO || todayISO());
  const due = reminder.trigger === "months" ? addMonths(serviced, reminder.limitValue) : addDays(serviced, reminder.limitValue);
  const warnAt = reminder.trigger === "months" ? addMonths(due, -reminder.warnValue) : addDays(due, -reminder.warnValue);
  const totalDays = Math.max(1, daysBetween(serviced, due));
  const elapsedDays = Math.max(0, daysBetween(serviced, now));
  const remainingDays = daysBetween(now, due);
  const progress = Math.min(100, Math.max(0, elapsedDays / totalDays) * 100);
  const tone: ServiceTone = now >= due ? "due" : now >= warnAt ? "warn" : "ok";

  return {
    tone,
    label: tone === "due" ? "Due now" : tone === "warn" ? "Warning" : "OK",
    progress,
    detail: `Last serviced ${shortDate(reminder.lastServicedAtISO)}`,
    remainingText: remainingDays <= 0 ? `${Math.abs(remainingDays)} day(s) overdue` : `${remainingDays} day(s) left`,
  };
}

function categoryOrder(category: Reminder["category"]) {
  return ["Respirator", "Booth", "Air System", "Compressor", "Other"].indexOf(category);
}

function makeNotice(reminder: Reminder, status: ReturnType<typeof statusFor>): Notice {
  return {
    id: `service-${reminder.id}-${Date.now()}`,
    title: `${reminder.name} serviced`,
    body: `Reset from ${status.label.toLowerCase()} state. ${status.remainingText}.`,
    severity: status.tone === "due" ? "warn" : "info",
    createdISO: new Date().toISOString(),
  };
}

export default function ServicePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtime, setRuntime] = useState<Runtime>({});
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSettings(loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone));
      setRuntime(loadJSON<Runtime>(KEYS.runtime, {}));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const reminders = useMemo(() => settings?.reminders ?? [], [settings?.reminders]);
  const serviceCounters = useMemo(() => normalizeServiceCounters(settings?.serviceCounters), [settings?.serviceCounters]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reminders
      .map((reminder) => ({ reminder, status: statusFor(reminder, runtime, now) }))
      .filter(({ reminder, status }) => {
        if (filter !== "all" && status.tone !== filter) return false;
        if (!q) return true;
        return `${reminder.name} ${reminder.category} ${reminder.counterId ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const severity: Record<ServiceTone, number> = { due: 0, warn: 1, ok: 2, disabled: 3 };
        return severity[a.status.tone] - severity[b.status.tone] || categoryOrder(a.reminder.category) - categoryOrder(b.reminder.category);
      });
  }, [filter, now, query, reminders, runtime]);

  const counts = reminders.reduce<Record<ServiceTone, number>>(
    (sum, reminder) => {
      const status = statusFor(reminder, runtime, now).tone;
      return { ...sum, [status]: sum[status] + 1 };
    },
    { due: 0, warn: 0, ok: 0, disabled: 0 }
  );

  const saveNextSettings = (next: Settings) => {
    setSettings(next);
    saveSetupSettings(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const resetReminder = (id: string) => {
    if (!settings) return;
    const reminder = settings.reminders.find((item) => item.id === id);
    if (!reminder) return;
    const status = statusFor(reminder, runtime, now);
    const next: Settings = {
      ...settings,
      reminders: settings.reminders.map((item) =>
        item.id === id
          ? {
              ...item,
              lastServicedAtISO: todayISO(),
              lastCounterValue: item.trigger === "hours" ? runtimeValue(runtime, item.counterId) : item.lastCounterValue,
            }
          : item
      ),
    };
    saveNextSettings(next);
    const notices = loadJSON<Notice[]>(KEYS.notifications, []);
    saveJSON(KEYS.notifications, [makeNotice(reminder, status), ...notices].slice(0, 50));
  };

  const toggleReminder = (id: string) => {
    if (!settings) return;
    saveNextSettings({
      ...settings,
      reminders: settings.reminders.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    });
  };

  const updateLastServiced = (id: string, value: string) => {
    if (!settings) return;
    saveNextSettings({
      ...settings,
      reminders: settings.reminders.map((item) => (item.id === id ? { ...item, lastServicedAtISO: value } : item)),
    });
  };

  const refreshRuntime = () => {
    setRuntime(loadJSON<Runtime>(KEYS.runtime, {}));
    setNow(new Date());
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">SERVICE CENTER</div>
          <h1>{settings?.shop?.name ?? "MARshall OS"}</h1>
          <p>Track respirator filters, booth service, air system work, compressor intervals, and hour counters.</p>
        </div>
        <div className="topActions">
          {savedAt && <span className="saved">Saved at {savedAt}</span>}
          <button className="btn ghost" onClick={refreshRuntime}>Refresh Runtime</button>
          <Link className="btn ghost" href="/service/manage">Edit Service Rules</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Due now" value={String(counts.due)} tone={counts.due ? "due" : "normal"} />
        <Metric label="Warnings" value={String(counts.warn)} tone={counts.warn ? "warn" : "normal"} />
        <Metric label="OK" value={String(counts.ok)} />
        <Metric label="Disabled" value={String(counts.disabled)} />
      </section>

      <section className="runtime">
        {serviceCounters.map((counter) => (
          <div className="runtimeBox" key={counter.id}>
            <span>{counter.name}</span>
            <strong>{runtimeValue(runtime, counter.id).toFixed(1)} hr</strong>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="tools">
          <div>
            <div className="panelTitle">Service Rules</div>
            <div className="panelText">{rows.length} reminder(s) shown</div>
          </div>
          <div className="filters">
            {(["all", "due", "warn", "ok", "disabled"] as FilterMode[]).map((item) => (
              <button key={item} className={`seg ${filter === item ? "on" : ""}`} onClick={() => setFilter(item)}>
                {item === "all" ? "All" : item === "warn" ? "Warning" : item === "ok" ? "OK" : item === "due" ? "Due" : "Disabled"}
              </button>
            ))}
          </div>
          <input className="input search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filters, booth, compressor..." />
        </div>

        <div className="serviceList">
          {rows.map(({ reminder, status }) => (
            <article className={`serviceCard ${status.tone}`} key={reminder.id}>
              <div className="cardMain">
                <div className="cardTop">
                  <div>
                    <div className="badges">
                      <span className={`badge ${status.tone}`}>{status.label}</span>
                      <span className="badge">{reminder.category}</span>
                      <span className="badge">{reminder.trigger}</span>
                    </div>
                    <h2>{reminder.name}</h2>
                  </div>
                  <strong className="remaining">{status.remainingText}</strong>
                </div>

                <div className="progressTrack">
                  <div className="progressFill" style={{ width: `${status.progress}%` }} />
                </div>

                <div className="detailGrid">
                  <Info label="Interval" value={`${reminder.limitValue} ${reminder.trigger === "hours" ? "hr" : reminder.trigger}`} />
                  <Info label="Warn at" value={`${reminder.warnValue} ${reminder.trigger === "hours" ? "hr" : reminder.trigger} before`} />
                  <Info label="Counter" value={reminder.counterId ? serviceCounters.find((counter) => counter.id === reminder.counterId)?.name ?? reminder.counterId : "Calendar"} />
                  <Info label="Service date" value={shortDate(reminder.lastServicedAtISO)} />
                </div>
              </div>

              <div className="cardActions">
                {(reminder.trigger === "days" || reminder.trigger === "months" || reminder.trigger === "manual_date") && (
                  <label className="label">
                    Last serviced
                    <input className="input" type="date" value={(reminder.lastServicedAtISO ?? "").slice(0, 10)} onChange={(event) => updateLastServiced(reminder.id, event.target.value)} />
                  </label>
                )}
                <button className="btn primary" onClick={() => resetReminder(reminder.id)}>Mark Serviced</button>
                <button className="btn ghost" onClick={() => toggleReminder(reminder.id)}>{reminder.enabled ? "Disable" : "Enable"}</button>
              </div>
            </article>
          ))}
          {rows.length === 0 && <div className="empty">No service reminders match this view.</div>}
        </div>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "due" | "warn" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .metrics, .runtime, .panel { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  h2 { margin: 8px 0 0; font-size: 22px; line-height: 1.1; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .filters { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .btn, .seg { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .metric, .runtimeBox, .panel, .serviceCard { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 14px; backdrop-filter: blur(10px); }
  .metric { padding: 14px; display: grid; gap: 4px; }
  .metric.due { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .metric.warn { border-color: rgba(255,190,80,.34); background: rgba(255,190,80,.1); }
  .metric span, .runtimeBox span, .info span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .metric strong { font-size: 28px; line-height: 1; }
  .runtime { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .runtimeBox { padding: 14px; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .runtimeBox strong { font-size: 22px; }
  .panel { padding: 16px; display: grid; gap: 14px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .tools { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(220px,.34fr); gap: 12px; align-items: end; }
  .seg { padding: 9px 11px; font-size: 12px; }
  .seg.on { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.34); }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .serviceList { display: grid; gap: 12px; }
  .serviceCard { padding: 14px; display: grid; grid-template-columns: minmax(0,1fr) minmax(220px,.28fr); gap: 14px; }
  .serviceCard.due { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.1); }
  .serviceCard.warn { border-color: rgba(255,190,80,.34); background: rgba(255,190,80,.08); }
  .serviceCard.disabled { opacity: .62; }
  .cardMain, .cardActions { display: grid; gap: 12px; align-content: start; }
  .cardTop { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .badges { display: flex; flex-wrap: wrap; gap: 7px; }
  .badge { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 6px 8px; font-size: 11px; font-weight: 950; text-transform: uppercase; }
  .badge.due { border-color: rgba(255,90,90,.4); background: rgba(255,90,90,.16); }
  .badge.warn { border-color: rgba(255,190,80,.36); background: rgba(255,190,80,.12); }
  .badge.ok { border-color: rgba(150,220,255,.28); background: rgba(120,200,255,.09); }
  .remaining { white-space: nowrap; font-size: 16px; }
  .progressTrack { height: 9px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.1); }
  .progressFill { height: 100%; border-radius: inherit; background: rgba(238,241,243,.72); }
  .detailGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .info { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); border-radius: 10px; padding: 10px; display: grid; gap: 5px; min-width: 0; }
  .info strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); }
  @media (max-width: 1080px) { .tools, .serviceCard { grid-template-columns: 1fr; } .detailGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 680px) { .wrap { padding: 12px; } .topbar { display: grid; } .topActions, .filters { justify-content: stretch; } .btn, .seg { flex: 1 1 auto; } .metrics, .runtime, .detailGrid { grid-template-columns: 1fr; } h1 { font-size: 38px; } .cardTop { display: grid; } }
`;
