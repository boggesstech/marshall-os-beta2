"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import {
  COUNTERS,
  defaultSetupSettings,
  defaultReminders,
  loadSetupSettings,
  saveSetupSettings,
  todayISO,
  uid,
  type CounterId,
  type Reminder,
  type TriggerType,
} from "@/lib/setupData";

export default function RulesSetupPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>(defaultReminders());
  const [returnStep, setReturnStep] = useState(2);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const requestedStep = Number(new URLSearchParams(window.location.search).get("returnStep"));
      if (Number.isInteger(requestedStep)) setReturnStep(requestedStep);
      const settings = loadSetupSettings();
      setReminders(settings?.reminders?.length ? settings.reminders : defaultReminders());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const counts = useMemo(() => {
    return {
      enabled: reminders.filter((r) => r.enabled).length,
      respirator: reminders.filter((r) => r.category === "Respirator").length,
      booth: reminders.filter((r) => r.category === "Booth").length,
      calendar: reminders.filter((r) => r.trigger === "days" || r.trigger === "months" || r.trigger === "manual_date").length,
    };
  }, [reminders]);

  const updateReminder = (id: string, patch: Partial<Reminder>) =>
    setReminders((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addReminder = () =>
    setReminders((list) => [
      ...list,
      {
        id: uid(),
        name: "Custom Reminder",
        category: "Other",
        enabled: true,
        trigger: "months",
        limitValue: 6,
        warnValue: 1,
        lastServicedAtISO: todayISO(),
      },
    ]);

  const save = () => {
    const settings = loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone);
    saveSetupSettings({
      ...settings,
      reminders: reminders.map((r) => ({
        ...r,
        name: r.name.trim() || "Reminder",
        lastServicedAtISO:
          r.trigger === "days" || r.trigger === "months" || r.trigger === "manual_date"
            ? r.lastServicedAtISO || todayISO()
            : r.lastServicedAtISO,
      })),
    });
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const continueSetup = () => {
    save();
    router.push(`/setup?step=${returnStep}`);
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="top">
        <div>
          <div className="micro">RULES SETUP</div>
          <h1>Rules & Alerts</h1>
          <p>Choose what MARshall tracks: spray hours, weld/sand hours, supplied-air hours, calendar inspections, and custom reminders.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => router.push(`/setup?step=${returnStep}`)}>Return to Setup</button>
          <Link className="btn ghost" href="/dashboard" onClick={save}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <div className="stats">
          <Stat label="Enabled" value={counts.enabled} />
          <Stat label="Respirator" value={counts.respirator} />
          <Stat label="Booth" value={counts.booth} />
          <Stat label="Calendar" value={counts.calendar} />
        </div>
        <div className="counterGrid">
          {COUNTERS.map((counter) => (
            <div className="counter" key={counter.id}>
              <span>{counter.name}</span>
              <strong>{reminders.filter((r) => r.counterId === counter.id && r.enabled).length} active</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelTop">
          <div>
            <div className="title">Reminder Rules</div>
            <div className="hint">Disable what you do not want. Edit limits, warning windows, counters, and last-serviced dates.</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={addReminder}>Add Custom Rule</button>
            <button className="btn primary" onClick={save}>Save Rules</button>
            <button className="btn primary" onClick={continueSetup}>Save & Continue Setup</button>
          </div>
        </div>
        {savedAt && <div className="saved">Saved at {savedAt}</div>}

        <div className="list">
          {reminders.map((reminder) => (
            <div className={`card ${reminder.enabled ? "" : "dim"}`} key={reminder.id}>
              <div className="cardTop">
                <div className="nameBlock">
                  <input className="name" value={reminder.name} onChange={(e) => updateReminder(reminder.id, { name: e.target.value })} />
                  <div className="metaLine">
                    <select className="small" value={reminder.category} onChange={(e) => updateReminder(reminder.id, { category: e.target.value as Reminder["category"] })}>
                      <option>Respirator</option>
                      <option>Booth</option>
                      <option>Air System</option>
                      <option>Compressor</option>
                      <option>Other</option>
                    </select>
                    <button className={`toggle ${reminder.enabled ? "on" : ""}`} onClick={() => updateReminder(reminder.id, { enabled: !reminder.enabled })}>
                      {reminder.enabled ? "Tracking" : "Off"}
                    </button>
                  </div>
                </div>
                <button className="x" onClick={() => setReminders((list) => list.filter((r) => r.id !== reminder.id))}>Remove</button>
              </div>

              <div className="grid">
                <label className="label">Trigger
                  <select className="input" value={reminder.trigger} onChange={(e) => updateReminder(reminder.id, { trigger: e.target.value as TriggerType })}>
                    <option value="hours">Hour counter</option>
                    <option value="days">Days since service</option>
                    <option value="months">Months since service</option>
                    <option value="manual_date">Manual date only</option>
                  </select>
                </label>

                {reminder.trigger !== "manual_date" && (
                  <>
                    <label className="label">Limit {unitLabel(reminder.trigger)}
                      <DecimalInput className="input" value={reminder.limitValue} onValueChange={(value) => updateReminder(reminder.id, { limitValue: value })} />
                    </label>
                    <label className="label">Warn before
                      <DecimalInput className="input" value={reminder.warnValue} onValueChange={(value) => updateReminder(reminder.id, { warnValue: value })} />
                    </label>
                  </>
                )}

                {reminder.trigger === "hours" && (
                  <label className="label">Counter
                    <select className="input" value={reminder.counterId ?? "spray_hours"} onChange={(e) => updateReminder(reminder.id, { counterId: e.target.value as CounterId })}>
                      {COUNTERS.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}
                    </select>
                  </label>
                )}

                {(reminder.trigger === "days" || reminder.trigger === "months" || reminder.trigger === "manual_date") && (
                  <label className="label">Last serviced date
                    <input className="input" type="date" value={(reminder.lastServicedAtISO ?? "").slice(0, 10)} onChange={(e) => updateReminder(reminder.id, { lastServicedAtISO: e.target.value })} />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function unitLabel(trigger: TriggerType) {
  if (trigger === "hours") return "(hours)";
  if (trigger === "days") return "(days)";
  if (trigger === "months") return "(months)";
  return "";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 24px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.4)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .top, .panel { width: min(1080px, 100%); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); }
  .top, .panelTop, .cardTop { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 4px 0 0; font-size: 38px; line-height: 1; }
  p, .hint { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin: 8px 0 0; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .saved { justify-self: end; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; }
  .btn, .x, .toggle { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .ghost { background: rgba(255,255,255,.05); }
  .toggle.on { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.3); }
  .stats, .counterGrid, .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .counterGrid, .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; }
  .stat, .counter { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; display: grid; gap: 5px; }
  .stat span, .counter span { opacity: .7; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .stat strong { font-size: 26px; }
  .title { font-size: 18px; font-weight: 1000; }
  .list { display: grid; gap: 12px; }
  .card { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; display: grid; gap: 12px; }
  .dim { opacity: .62; }
  .nameBlock { flex: 1 1 480px; display: grid; gap: 8px; }
  .name { width: 100%; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 12px; outline: none; font-weight: 900; }
  .metaLine { display: flex; gap: 8px; flex-wrap: wrap; }
  .small, .input { width: 100%; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .small { width: auto; min-width: 150px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 800; }
  @media (max-width: 820px) { .wrap { padding: 14px; } .top, .stats, .counterGrid, .grid { display: grid; grid-template-columns: 1fr; } .actions .btn { flex: 1 1 auto; } }
`;
