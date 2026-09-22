"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { KEYS, loadJSON } from "@/lib/marStorage";
import {
  COUNTERS,
  defaultSetupSettings,
  loadSetupSettings,
  normalizeServiceCounters,
  saveSetupSettings,
  todayISO,
  uid,
  type Reminder,
  type ServiceCounter,
  type Settings,
  type TriggerType,
} from "@/lib/setupData";

type Runtime = {
  sprayHours?: number;
  suppliedAirHours?: number;
  weldSandHours?: number;
  customCounterHours?: Record<string, number>;
};

type Category = Reminder["category"];
type ViewMode = "all" | "enabled" | "disabled";

const categories: Category[] = ["Respirator", "Booth", "Air System", "Compressor", "Other"];
const runtimeMap: Record<string, keyof Runtime> = {
  spray_hours: "sprayHours",
  supplied_air_hours: "suppliedAirHours",
  weld_sand_hours: "weldSandHours",
};

function blankReminder(runtime: Runtime): Reminder {
  return {
    id: uid(),
    name: "Custom Service Rule",
    category: "Other",
    enabled: true,
    trigger: "months",
    limitValue: 6,
    warnValue: 1,
    lastServicedAtISO: todayISO(),
    lastCounterValue: runtime.sprayHours ?? 0,
  };
}

function counterValue(runtime: Runtime, counterId?: string) {
  if (!counterId) return 0;
  const mapped = runtimeMap[counterId];
  return Number(mapped ? runtime[mapped] ?? 0 : runtime.customCounterHours?.[counterId] ?? 0);
}

function triggerLabel(trigger: TriggerType) {
  if (trigger === "hours") return "Hour counter";
  if (trigger === "days") return "Days since service";
  if (trigger === "months") return "Months since service";
  return "Manual date";
}

function intervalLabel(reminder: Reminder) {
  if (reminder.trigger === "manual_date") return "Manual date";
  if (reminder.trigger === "hours") return `${reminder.limitValue} hr`;
  if (reminder.trigger === "days") return `${reminder.limitValue} days`;
  return `${reminder.limitValue} months`;
}

function normalizeReminder(reminder: Reminder): Reminder {
  return {
    ...reminder,
    name: reminder.name.trim() || "Service Rule",
    counterId: reminder.trigger === "hours" ? reminder.counterId ?? "spray_hours" : reminder.counterId,
    lastServicedAtISO:
      reminder.trigger === "days" || reminder.trigger === "months" || reminder.trigger === "manual_date"
        ? reminder.lastServicedAtISO || todayISO()
        : reminder.lastServicedAtISO,
  };
}

export default function ServiceManagePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtime, setRuntime] = useState<Runtime>({});
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("all");
  const [savedAt, setSavedAt] = useState("");
  const [counterDraft, setCounterDraft] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loaded = loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const loadedRuntime = loadJSON<Runtime>(KEYS.runtime, {});
      setSettings(loaded);
      setRuntime(loadedRuntime);
      setSelectedId(loaded.reminders[0]?.id ?? "");
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const reminders = useMemo(() => settings?.reminders ?? [], [settings?.reminders]);
  const serviceCounters = useMemo(() => normalizeServiceCounters(settings?.serviceCounters), [settings?.serviceCounters]);
  const selected = reminders.find((reminder) => reminder.id === selectedId) ?? reminders[0] ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reminders
      .filter((reminder) => {
        if (view === "enabled" && !reminder.enabled) return false;
        if (view === "disabled" && reminder.enabled) return false;
        if (!q) return true;
        return `${reminder.name} ${reminder.category} ${reminder.trigger} ${reminder.counterId ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [query, reminders, view]);

  const counts = useMemo(() => ({
    total: reminders.length,
    enabled: reminders.filter((reminder) => reminder.enabled).length,
    disabled: reminders.filter((reminder) => !reminder.enabled).length,
    hour: reminders.filter((reminder) => reminder.trigger === "hours").length,
  }), [reminders]);

  const saveSettings = (next: Settings) => {
    const clean = {
      ...next,
      serviceCounters: normalizeServiceCounters(next.serviceCounters),
      reminders: next.reminders.map(normalizeReminder),
    };
    setSettings(clean);
    saveSetupSettings(clean);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const updateReminder = (id: string, patch: Partial<Reminder>) => {
    if (!settings) return;
    const next = {
      ...settings,
      reminders: settings.reminders.map((reminder) => (reminder.id === id ? { ...reminder, ...patch } : reminder)),
    };
    setSettings(next);
    setSavedAt("");
  };

  const saveNow = () => {
    if (!settings) return;
    saveSettings(settings);
  };

  const addReminder = () => {
    if (!settings) return;
    const reminder = blankReminder(runtime);
    const next = { ...settings, reminders: [reminder, ...settings.reminders] };
    setSettings(next);
    setSelectedId(reminder.id);
    setSavedAt("");
  };

  const duplicateReminder = (reminder: Reminder) => {
    if (!settings) return;
    const copy = { ...reminder, id: uid(), name: `${reminder.name} Copy` };
    const next = { ...settings, reminders: [copy, ...settings.reminders] };
    setSettings(next);
    setSelectedId(copy.id);
    setSavedAt("");
  };

  const removeReminder = (id: string) => {
    if (!settings) return;
    const nextReminders = settings.reminders.filter((reminder) => reminder.id !== id);
    setSettings({ ...settings, reminders: nextReminders });
    setSelectedId(nextReminders[0]?.id ?? "");
    setSavedAt("");
  };

  const resetBaseline = (reminder: Reminder) => {
    updateReminder(reminder.id, {
      lastServicedAtISO: todayISO(),
      lastCounterValue: reminder.trigger === "hours" ? counterValue(runtime, reminder.counterId) : reminder.lastCounterValue,
    });
  };

  const addCounter = () => {
    if (!settings) return;
    const name = counterDraft.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `counter_${uid()}`;
    const counter: ServiceCounter = { id, name };
    setSettings({ ...settings, serviceCounters: normalizeServiceCounters([...serviceCounters, counter]) });
    setCounterDraft("");
    setSavedAt("");
  };

  const removeCounter = (id: string) => {
    if (!settings || COUNTERS.some((counter) => counter.id === id)) return;
    setSettings({
      ...settings,
      serviceCounters: serviceCounters.filter((counter) => counter.id !== id),
      reminders: settings.reminders.map((reminder) => reminder.counterId === id ? { ...reminder, counterId: "spray_hours" } : reminder),
    });
    setSavedAt("");
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">SERVICE SETTINGS</div>
          <h1>Service Rules</h1>
          <p>Add, edit, duplicate, disable, or remove shop service reminders without rerunning setup.</p>
        </div>
        <div className="topActions">
          {savedAt && <span className="saved">Saved at {savedAt}</span>}
          <button className="btn primary" onClick={saveNow}>Save Rules</button>
          <Link className="btn ghost" href="/service">Service Center</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Total rules" value={String(counts.total)} />
        <Metric label="Enabled" value={String(counts.enabled)} />
        <Metric label="Disabled" value={String(counts.disabled)} />
        <Metric label="Hour rules" value={String(counts.hour)} />
      </section>

      <section className="layout">
        <aside className="listPanel">
          <div className="panelTop">
            <div>
              <div className="panelTitle">Rules List</div>
              <div className="panelText">{filtered.length} shown</div>
            </div>
            <button className="btn primary" onClick={addReminder}>Add Rule</button>
          </div>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service rules..." />
          <div className="filters">
            {(["all", "enabled", "disabled"] as ViewMode[]).map((mode) => (
              <button key={mode} className={`seg ${view === mode ? "on" : ""}`} onClick={() => setView(mode)}>
                {mode === "all" ? "All" : mode === "enabled" ? "Enabled" : "Disabled"}
              </button>
            ))}
          </div>
          <div className="ruleList">
            {filtered.map((reminder) => (
              <button key={reminder.id} className={`ruleItem ${selected?.id === reminder.id ? "active" : ""} ${reminder.enabled ? "" : "off"}`} onClick={() => setSelectedId(reminder.id)}>
                <span>{reminder.category}</span>
                <strong>{reminder.name}</strong>
                <small>{intervalLabel(reminder)} · {triggerLabel(reminder.trigger)}</small>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty">No service rules match.</div>}
          </div>
        </aside>

        <section className="editorPanel">
          {!selected ? (
            <div className="empty">Select or add a service rule.</div>
          ) : (
            <>
              <div className="editorTop">
                <div>
                  <div className="micro">EDITING</div>
                  <div className="editorTitle">{selected.name}</div>
                </div>
                <div className="actions">
                  <button className={`btn ${selected.enabled ? "primary" : "ghost"}`} onClick={() => updateReminder(selected.id, { enabled: !selected.enabled })}>
                    {selected.enabled ? "Tracking On" : "Tracking Off"}
                  </button>
                  <button className="btn ghost" onClick={() => duplicateReminder(selected)}>Duplicate</button>
                  <button className="btn danger" onClick={() => removeReminder(selected.id)}>Remove</button>
                </div>
              </div>

              <div className="formGrid">
                <label className="label full">Rule name
                  <input className="input" value={selected.name} onChange={(event) => updateReminder(selected.id, { name: event.target.value })} />
                </label>

                <label className="label">Category
                  <select className="input" value={selected.category} onChange={(event) => updateReminder(selected.id, { category: event.target.value as Category })}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>

                <label className="label">Trigger
                  <select className="input" value={selected.trigger} onChange={(event) => updateReminder(selected.id, { trigger: event.target.value as TriggerType })}>
                    <option value="hours">Hour counter</option>
                    <option value="days">Days since service</option>
                    <option value="months">Months since service</option>
                    <option value="manual_date">Manual date only</option>
                  </select>
                </label>

                {selected.trigger !== "manual_date" && (
                  <>
                    <label className="label">Limit
                      <DecimalInput className="input" value={selected.limitValue} onValueChange={(value) => updateReminder(selected.id, { limitValue: value })} />
                    </label>
                    <label className="label">Warn before
                      <DecimalInput className="input" value={selected.warnValue} onValueChange={(value) => updateReminder(selected.id, { warnValue: value })} />
                    </label>
                  </>
                )}

                {selected.trigger === "hours" && (
                  <>
                    <label className="label">Hour counter
                      <select className="input" value={selected.counterId ?? "spray_hours"} onChange={(event) => updateReminder(selected.id, { counterId: event.target.value })}>
                        {serviceCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}
                      </select>
                    </label>
                    <label className="label">Baseline hours
                      <DecimalInput className="input" value={selected.lastCounterValue ?? 0} onValueChange={(value) => updateReminder(selected.id, { lastCounterValue: value })} />
                    </label>
                  </>
                )}

                {(selected.trigger === "days" || selected.trigger === "months" || selected.trigger === "manual_date") && (
                  <label className="label">Last serviced date
                    <input className="input" type="date" value={(selected.lastServicedAtISO ?? "").slice(0, 10)} onChange={(event) => updateReminder(selected.id, { lastServicedAtISO: event.target.value })} />
                  </label>
                )}
              </div>

              <div className="runtimeGrid">
                {serviceCounters.map((counter) => (
                  <div className="runtimeBox" key={counter.id}>
                    <span>{counter.name}</span>
                    <strong>{counterValue(runtime, counter.id).toFixed(1)} hr</strong>
                    {!COUNTERS.some((item) => item.id === counter.id) && <button className="miniRemove" onClick={() => removeCounter(counter.id)}>Remove</button>}
                  </div>
                ))}
              </div>

              <div className="addCounter">
                <input className="input" value={counterDraft} onChange={(event) => setCounterDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCounter()} placeholder="Add hour counter, example: Prep hours" />
                <button className="btn ghost" onClick={addCounter}>Add Counter</button>
              </div>

              <div className="actions end">
                <button className="btn ghost" onClick={() => resetBaseline(selected)}>Set Baseline To Now</button>
                <button className="btn primary" onClick={saveNow}>Save Rules</button>
              </div>
            </>
          )}
        </section>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .metrics, .layout { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .actions, .filters, .panelTop, .editorTop { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .btn, .seg { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .metric, .listPanel, .editorPanel, .ruleItem, .runtimeBox { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 14px; backdrop-filter: blur(10px); }
  .metric { padding: 14px; display: grid; gap: 4px; }
  .metric span, .ruleItem span, .runtimeBox span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .metric strong { font-size: 28px; line-height: 1; }
  .layout { display: grid; grid-template-columns: minmax(300px,.34fr) minmax(0,1fr); gap: 14px; align-items: start; }
  .listPanel, .editorPanel { padding: 16px; display: grid; gap: 13px; }
  .listPanel { position: sticky; top: 14px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .filters { justify-content: stretch; }
  .seg { flex: 1 1 auto; padding: 9px 11px; font-size: 12px; }
  .seg.on { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.34); }
  .ruleList { display: grid; gap: 9px; max-height: 62vh; overflow: auto; padding-right: 4px; }
  .ruleItem { color: #eef1f3; cursor: pointer; padding: 12px; display: grid; gap: 5px; text-align: left; }
  .ruleItem.active { border-color: rgba(150,220,255,.34); background: rgba(120,200,255,.1); }
  .ruleItem.off { opacity: .62; }
  .ruleItem strong { line-height: 1.2; }
  .ruleItem small { color: rgba(238,241,243,.68); }
  .editorTitle { font-size: 24px; font-weight: 1000; line-height: 1.1; }
  .formGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .full { grid-column: 1 / -1; }
  .runtimeGrid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
  .runtimeBox { padding: 12px; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .runtimeBox strong { font-size: 20px; }
  .miniRemove { border: 1px solid rgba(255,120,120,.26); background: rgba(255,80,80,.1); color: #eef1f3; border-radius: 8px; padding: 7px 8px; cursor: pointer; font-weight: 900; }
  .addCounter { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; }
  .end { justify-content: flex-end; }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); }
  @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } .listPanel { position: static; } .metrics, .runtimeGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 680px) { .wrap { padding: 12px; } .topbar, .editorTop { display: grid; } .topActions, .actions { justify-content: stretch; } .btn { flex: 1 1 auto; } .metrics, .runtimeGrid, .formGrid, .addCounter { grid-template-columns: 1fr; } .full { grid-column: auto; } h1 { font-size: 38px; } }
`;
