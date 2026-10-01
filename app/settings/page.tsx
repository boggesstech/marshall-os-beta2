"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper, { notifySettingsUpdated, WALLPAPERS, type WallpaperId } from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import {
  COMPLETE_KEY,
  COUNTERS,
  CUSTOMERS_KEY,
  DEFAULT_LABOR_BILLING,
  INVENTORY_KEY,
  SETTINGS_KEY,
  SOUND_CHOICES,
  todayISO,
  uid,
  defaultSetupSettings,
  loadSetupSettings,
  parseEmails,
  saveSetupSettings,
  type CounterId,
  type LaborBillingSettings,
  type MaterialBillingMode,
  type Reminder,
  type Settings,
  type SoundId,
  type TriggerType,
} from "@/lib/setupData";

type Tab = "general" | "account" | "service" | "jobs" | "billing" | "features";

const FACTORY_KEYS = [
  COMPLETE_KEY,
  SETTINGS_KEY,
  CUSTOMERS_KEY,
  INVENTORY_KEY,
  "marshall_jobs_v1",
  "marshall_sessions_v1",
  "marshall_runtime_v1",
  "marshall_notifications_v1",
  "marshall_resources_v2",
  "marshall_invoices_v1",
  "marshall_invoice_drafts_v1",
  "marshall_invoice_setup_v1",
] as const;

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    billing: {
      ...settings.billing,
      labor: {
        ...DEFAULT_LABOR_BILLING,
        ...(settings.billing?.labor ?? {}),
      },
    },
  };
}

function blankReminder(): Reminder {
  return {
    id: uid(),
    name: "New Service Rule",
    category: "Other",
    enabled: true,
    trigger: "months",
    limitValue: 6,
    warnValue: 1,
    lastServicedAtISO: todayISO(),
  };
}

function unitLabel(trigger: TriggerType) {
  if (trigger === "hours") return "hours";
  if (trigger === "days") return "days";
  if (trigger === "months") return "months";
  return "manual";
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(() => defaultSetupSettings());
  const [alertEmailsRaw, setAlertEmailsRaw] = useState("");
  const [tab, setTab] = useState<Tab>("general");
  const [jobTypeDraft, setJobTypeDraft] = useState("");
  const [stageDraft, setStageDraft] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loaded = normalizeSettings(loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone));
      setSettings(loaded);
      setAlertEmailsRaw((loaded.shop.alertEmails ?? []).join(", "));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const labor = useMemo(() => ({ ...DEFAULT_LABOR_BILLING, ...(settings.billing?.labor ?? {}) }), [settings.billing?.labor]);

  const stats = useMemo(() => ({
    rules: settings.reminders.length,
    activeRules: settings.reminders.filter((rule) => rule.enabled).length,
    jobTypes: settings.jobs.jobTypes.length,
    stages: settings.jobs.stages.length,
    labor: labor.enabled ? `$${labor.hourlyRate || 0}/hr` : "Off",
  }), [settings, labor.enabled, labor.hourlyRate]);

  const updateSettings = (patch: (current: Settings) => Settings) => {
    setSettings((current) => normalizeSettings(patch(current)));
    setSavedAt("");
  };

  const save = () => {
    const next = normalizeSettings({
      ...settings,
      shop: {
        ...settings.shop,
        alertEmails: parseEmails(alertEmailsRaw),
      },
    });
    setSettings(next);
    saveSetupSettings(next);
    notifySettingsUpdated();
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const applyWallpaper = (wallpaper: WallpaperId) => {
    const next = normalizeSettings({ ...settings, ui: { ...settings.ui, wallpaper } });
    setSettings(next);
    saveSetupSettings(next);
    notifySettingsUpdated();
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const applySound = (sound: SoundId) => {
    const next = normalizeSettings({ ...settings, ui: { ...settings.ui, sound } });
    setSettings(next);
    saveSetupSettings(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const previewSound = () => {
    const chosen = SOUND_CHOICES.find((sound) => sound.id === settings.ui.sound);
    if (!chosen) return;
    const audio = new Audio(chosen.url);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  };

  const factoryReset = () => {
    for (const key of FACTORY_KEYS) {
      localStorage.removeItem(key);
    }
    router.push("/");
  };

  const updateReminder = (id: string, patch: Partial<Reminder>) => {
    updateSettings((current) => ({
      ...current,
      reminders: current.reminders.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const addReminder = () => {
    updateSettings((current) => ({ ...current, reminders: [...current.reminders, blankReminder()] }));
  };

  const removeReminder = (id: string) => {
    updateSettings((current) => ({ ...current, reminders: current.reminders.filter((rule) => rule.id !== id) }));
  };

  const updateLabor = (patch: Partial<LaborBillingSettings>) => {
    updateSettings((current) => ({
      ...current,
      billing: {
        ...current.billing,
        labor: {
          ...DEFAULT_LABOR_BILLING,
          ...(current.billing?.labor ?? {}),
          ...patch,
        },
      },
    }));
  };

  const addJobType = () => {
    const value = jobTypeDraft.trim();
    if (!value) return;
    updateSettings((current) => ({
      ...current,
      jobs: {
        ...current.jobs,
        jobTypes: current.jobs.jobTypes.includes(value) ? current.jobs.jobTypes : [...current.jobs.jobTypes, value],
      },
    }));
    setJobTypeDraft("");
  };

  const addStage = () => {
    const value = stageDraft.trim();
    if (!value) return;
    updateSettings((current) => ({
      ...current,
      jobs: {
        ...current.jobs,
        stages: current.jobs.stages.includes(value) ? current.jobs.stages : [...current.jobs.stages, value],
      },
    }));
    setStageDraft("");
  };

  const removeJobType = (value: string) => {
    updateSettings((current) => ({ ...current, jobs: { ...current.jobs, jobTypes: current.jobs.jobTypes.filter((item) => item !== value) } }));
  };

  const removeStage = (value: string) => {
    updateSettings((current) => ({ ...current, jobs: { ...current.jobs, stages: current.jobs.stages.filter((item) => item !== value) } }));
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">SETTINGS</div>
          <h1>Settings</h1>
          <p>Edit MARshall OS defaults without rerunning first-time setup.</p>
        </div>
        <div className="topActions">
          {savedAt && <span className="saved">Saved at {savedAt}</span>}
          <button className="btn primary" onClick={save}>Save Changes</button>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="stats">
        <Stat label="Rules" value={String(stats.rules)} />
        <Stat label="Tracking" value={String(stats.activeRules)} />
        <Stat label="Job types" value={String(stats.jobTypes)} />
        <Stat label="Stages" value={String(stats.stages)} />
        <Stat label="Labor" value={stats.labor} />
      </section>

      <section className="tabs">
        {(["general", "account", "service", "jobs", "billing", "features"] as Tab[]).map((item) => (
          <button key={item} className={`tab ${tab === item ? "on" : ""}`} onClick={() => setTab(item)}>
            {tabLabel(item)}
          </button>
        ))}
      </section>

      {tab === "general" && (
        <section className="panel">
          <PanelTitle title="General" text="Wallpaper, notification sound, and reset controls." />
          <div className="twoCol">
            <div>
              <div className="subTitle">Wallpaper</div>
              <div className="wallGrid">
                {WALLPAPERS.map((wallpaper) => (
                  <button key={wallpaper.id} className={`wall ${settings.ui.wallpaper === wallpaper.id ? "on" : ""}`} onClick={() => applyWallpaper(wallpaper.id)}>
                    <span className="thumb" style={{ backgroundImage: `url(${wallpaper.url})` }} />
                    <span>{wallpaper.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="subTitle">Notification Sound</div>
              <div className="soundGrid">
                {SOUND_CHOICES.map((sound) => (
                  <button key={sound.id} className={`sound ${settings.ui.sound === sound.id ? "on" : ""}`} onClick={() => applySound(sound.id)}>
                    {sound.name}
                  </button>
                ))}
              </div>
              <button className="btn preview" onClick={previewSound}>Preview Sound</button>
            </div>
          </div>

          <div className="factoryBox">
            <div>
              <strong>Reset to factory settings</strong>
              <p>This clears local MARshall OS data in this browser and sends you back to first-time setup.</p>
            </div>
            <div className="factoryActions">
              {!confirmReset ? (
                <button className="btn danger" onClick={() => setConfirmReset(true)}>Factory Reset</button>
              ) : (
                <>
                  <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                  <button className="btn danger" onClick={factoryReset}>Confirm Reset</button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "account" && (
        <section className="panel">
          <PanelTitle title="Account" text="Edit the identity and alert details used across the app." />
          <div className="formGrid">
            <label className="label">Your name<input className="input" value={settings.user.name} onChange={(event) => updateSettings((current) => ({ ...current, user: { ...current.user, name: event.target.value } }))} /></label>
            <label className="label">Your email<input className="input" value={settings.user.email ?? ""} onChange={(event) => updateSettings((current) => ({ ...current, user: { ...current.user, email: event.target.value } }))} /></label>
            <label className="label">Your phone<input className="input" value={settings.user.phone ?? ""} onChange={(event) => updateSettings((current) => ({ ...current, user: { ...current.user, phone: event.target.value } }))} /></label>
            <label className="label">Business name<input className="input" value={settings.shop.business ?? ""} onChange={(event) => updateSettings((current) => ({ ...current, shop: { ...current.shop, business: event.target.value } }))} /></label>
            <label className="label">Shop display name<input className="input" value={settings.shop.name} onChange={(event) => updateSettings((current) => ({ ...current, shop: { ...current.shop, name: event.target.value } }))} /></label>
            <label className="label">Timezone<input className="input" value={settings.shop.timezone} onChange={(event) => updateSettings((current) => ({ ...current, shop: { ...current.shop, timezone: event.target.value } }))} /></label>
            <label className="label full">Alert emails<input className="input" value={alertEmailsRaw} onChange={(event) => { setAlertEmailsRaw(event.target.value); setSavedAt(""); }} placeholder="you@email.com, miles@email.com" /></label>
          </div>
        </section>
      )}

      {tab === "service" && (
        <section className="panel">
          <div className="panelTop">
            <PanelTitle title="Service" text="Add, edit, disable, or remove filter and service reminders." />
            <button className="btn primary" onClick={addReminder}>Add Rule</button>
          </div>
          <div className="ruleList">
            {settings.reminders.map((rule) => (
              <article className={`ruleCard ${rule.enabled ? "" : "off"}`} key={rule.id}>
                <div className="ruleTop">
                  <input className="nameInput" value={rule.name} onChange={(event) => updateReminder(rule.id, { name: event.target.value })} />
                  <div className="ruleActions">
                    <button className={`miniToggle ${rule.enabled ? "on" : ""}`} onClick={() => updateReminder(rule.id, { enabled: !rule.enabled })}>{rule.enabled ? "Tracking" : "Off"}</button>
                    <button className="btn ghost" onClick={() => removeReminder(rule.id)}>Remove</button>
                  </div>
                </div>
                <div className="formGrid compact">
                  <label className="label">Category
                    <select className="input" value={rule.category} onChange={(event) => updateReminder(rule.id, { category: event.target.value as Reminder["category"] })}>
                      <option>Respirator</option>
                      <option>Booth</option>
                      <option>Air System</option>
                      <option>Compressor</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label className="label">Trigger
                    <select className="input" value={rule.trigger} onChange={(event) => updateReminder(rule.id, { trigger: event.target.value as TriggerType })}>
                      <option value="hours">Hour counter</option>
                      <option value="days">Days since service</option>
                      <option value="months">Months since service</option>
                      <option value="manual_date">Manual date only</option>
                    </select>
                  </label>
                  {rule.trigger !== "manual_date" && (
                    <>
                      <label className="label">Limit ({unitLabel(rule.trigger)})<DecimalInput className="input" value={rule.limitValue} onValueChange={(value) => updateReminder(rule.id, { limitValue: value })} /></label>
                      <label className="label">Warn before<DecimalInput className="input" value={rule.warnValue} onValueChange={(value) => updateReminder(rule.id, { warnValue: value })} /></label>
                    </>
                  )}
                  {rule.trigger === "hours" && (
                    <>
                      <label className="label">Counter
                        <select className="input" value={rule.counterId ?? "spray_hours"} onChange={(event) => updateReminder(rule.id, { counterId: event.target.value as CounterId })}>
                          {COUNTERS.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}
                        </select>
                      </label>
                      <label className="label">Last reset counter<DecimalInput className="input" value={rule.lastCounterValue ?? 0} onValueChange={(value) => updateReminder(rule.id, { lastCounterValue: value })} /></label>
                    </>
                  )}
                  {(rule.trigger === "days" || rule.trigger === "months" || rule.trigger === "manual_date") && (
                    <label className="label">Last serviced date<input className="input" type="date" value={(rule.lastServicedAtISO ?? "").slice(0, 10)} onChange={(event) => updateReminder(rule.id, { lastServicedAtISO: event.target.value })} /></label>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "jobs" && (
        <section className="panel">
          <PanelTitle title="Jobs" text="Add and remove reusable job types and default workflow stages." />
          <div className="twoCol">
            <ListEditor title="Job Types" value={jobTypeDraft} onValue={setJobTypeDraft} onAdd={addJobType} items={settings.jobs.jobTypes} onRemove={removeJobType} placeholder="Add job type" />
            <ListEditor title="Stages" value={stageDraft} onValue={setStageDraft} onAdd={addStage} items={settings.jobs.stages} onRemove={removeStage} placeholder="Add stage" />
          </div>
          <ToggleRow label="Use chunks" text="Track cab, doors, fenders, and sections inside jobs." value={settings.jobs.useChunks} onChange={(useChunks) => updateSettings((current) => ({ ...current, jobs: { ...current.jobs, useChunks } }))} />
        </section>
      )}

      {tab === "billing" && (
        <section className="panel">
          <PanelTitle title="Billing" text="Control how job estimates count labor, material charges, taxes, and expenses." />
          <div className="formGrid">
            <ToggleRow label="Enable labor billing" text="Show gross and net estimates from labor." value={labor.enabled} onChange={(enabled) => updateLabor({ enabled })} />
            <ToggleRow label="Include materials in total" text="Allow materials to be billed to the customer." value={labor.includeMaterials} onChange={(includeMaterials) => updateLabor({ includeMaterials })} />
            <ToggleRow label="Count materials as expenses" text="Subtract material cost from net pay." value={labor.countMaterialsAsExpense} onChange={(countMaterialsAsExpense) => updateLabor({ countMaterialsAsExpense })} />
            <label className="label">Labor label<input className="input" value={labor.laborLabel} onChange={(event) => updateLabor({ laborLabel: event.target.value })} /></label>
            <label className="label">Hourly rate<DecimalInput className="input" value={labor.hourlyRate} onValueChange={(value) => updateLabor({ hourlyRate: value })} /></label>
            <label className="label">Minimum billable hours<DecimalInput className="input" value={labor.minimumHours} onValueChange={(value) => updateLabor({ minimumHours: value })} /></label>
            <label className="label">Billing increment minutes<DecimalInput className="input" value={labor.billingIncrementMinutes} onValueChange={(value) => updateLabor({ billingIncrementMinutes: value })} /></label>
            <label className="label">Default material billing
              <select className="input" value={labor.materialBillingMode} onChange={(event) => updateLabor({ materialBillingMode: event.target.value as MaterialBillingMode })}>
                <option value="none">Customer pays no materials</option>
                <option value="percent">Customer pays a percentage</option>
                <option value="all">Customer pays all materials</option>
              </select>
            </label>
            <label className="label">Material charge percent<DecimalInput className="input" value={labor.materialBillingPercent} onValueChange={(value) => updateLabor({ materialBillingPercent: value })} /></label>
            <label className="label">Material markup percent<DecimalInput className="input" value={labor.materialMarkupPercent} onValueChange={(value) => updateLabor({ materialMarkupPercent: value })} /></label>
            <label className="label">Tax percent<DecimalInput className="input" value={labor.taxPercent} onValueChange={(value) => updateLabor({ taxPercent: value })} /></label>
          </div>
        </section>
      )}

      {tab === "features" && (
        <section className="panel">
          <PanelTitle title="Features" text="Turn major areas on or off while keeping stored data intact." />
          <div className="toggleGrid">
            <ToggleRow label="Customer tracking" text="Enable customer records and job linking." value={settings.customers.enabled} onChange={(enabled) => updateSettings((current) => ({ ...current, customers: { ...current.customers, enabled, allowJobCustomerLinking: enabled ? current.customers.allowJobCustomerLinking : false } }))} />
            <ToggleRow label="Link jobs to customers" text="Allow job folders to reference customer records." value={settings.customers.allowJobCustomerLinking} onChange={(allowJobCustomerLinking) => updateSettings((current) => ({ ...current, customers: { ...current.customers, allowJobCustomerLinking } }))} />
            <ToggleRow label="Require customer on jobs" text="Prefer jobs to have a customer assigned." value={settings.customers.requireCustomerOnJobs} onChange={(requireCustomerOnJobs) => updateSettings((current) => ({ ...current, customers: { ...current.customers, requireCustomerOnJobs } }))} />
            <ToggleRow label="Inventory" text="Enable inventory and material usage tracking." value={settings.inventory.enabled} onChange={(enabled) => updateSettings((current) => ({ ...current, inventory: { ...current.inventory, enabled, mode: enabled ? "now" : "skip" } }))} />
            <ToggleRow label="Consumables / materials" text="Track materials, paint, discs, tape, and supplies." value={settings.inventory.enableConsumables} onChange={(enableConsumables) => updateSettings((current) => ({ ...current, inventory: { ...current.inventory, enableConsumables } }))} />
            <ToggleRow label="Parts" text="Track replacement parts and job hardware." value={settings.inventory.enableParts} onChange={(enableParts) => updateSettings((current) => ({ ...current, inventory: { ...current.inventory, enableParts } }))} />
            <ToggleRow label="MARshall sass" text="Allow Inventory Easter egg popups and smart-mouth reactions." value={settings.ui.sassEnabled ?? true} onChange={(sassEnabled) => updateSettings((current) => ({ ...current, ui: { ...current.ui, sassEnabled } }))} />
          </div>
        </section>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function tabLabel(tab: Tab) {
  if (tab === "general") return "General";
  if (tab === "account") return "Account";
  if (tab === "service") return "Service";
  if (tab === "jobs") return "Jobs";
  if (tab === "billing") return "Billing";
  return "Features";
}

function PanelTitle({ title, text }: { title: string; text: string }) {
  return <div className="panelHead"><div className="panelTitle">{title}</div><div className="panelText">{text}</div></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function ToggleRow({ label, text, value, onChange }: { label: string; text: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`toggleRow ${value ? "on" : ""}`} onClick={() => onChange(!value)} type="button" aria-pressed={value}>
      <span className="dot" />
      <span><strong>{label}</strong><small>{text}</small></span>
    </button>
  );
}

function ListEditor({
  title,
  value,
  onValue,
  onAdd,
  items,
  onRemove,
  placeholder,
}: {
  title: string;
  value: string;
  onValue: (value: string) => void;
  onAdd: () => void;
  items: string[];
  onRemove: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="listEditor">
      <div className="panelTitle">{title}</div>
      <div className="addRow">
        <input className="input" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} placeholder={placeholder} />
        <button className="btn" onClick={onAdd}>Add</button>
      </div>
      <div className="chips">
        {items.map((item) => (
          <button className="chip" key={item} onClick={() => onRemove(item)}>{item}<span>Remove</span></button>
        ))}
      </div>
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .stats, .tabs, .panel { width: min(1220px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .ruleActions, .factoryActions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .btn, .tab, .miniToggle { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { background: rgba(255,80,80,.13); border-color: rgba(255,80,80,.3); }
  .stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  .stat, .panel, .ruleCard, .listEditor, .toggleRow, .factoryBox { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 14px; backdrop-filter: blur(10px); }
  .stat { padding: 14px; display: grid; gap: 4px; }
  .stat span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .stat strong { font-size: 25px; line-height: 1; }
  .tabs { display: flex; gap: 9px; flex-wrap: wrap; }
  .tab { background: rgba(0,0,0,.34); }
  .tab.on { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.34); }
  .panel { padding: 16px; display: grid; gap: 14px; }
  .panelTop, .ruleTop, .factoryBox { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .subTitle { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 1000; opacity: .72; margin-bottom: 9px; }
  .formGrid, .toggleGrid, .twoCol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .formGrid.compact { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .full { grid-column: 1 / -1; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .input, .nameInput { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .wallGrid, .soundGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .wall, .sound { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 11px; cursor: pointer; text-align: left; font-weight: 900; }
  .wall { display: grid; gap: 8px; }
  .wall.on, .sound.on { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.32); }
  .thumb { height: 74px; border-radius: 7px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.12); }
  .preview { margin-top: 10px; }
  .factoryBox { padding: 14px; align-items: center; }
  .factoryBox p { max-width: 680px; }
  .ruleList { display: grid; gap: 12px; }
  .ruleCard, .listEditor { padding: 14px; display: grid; gap: 12px; }
  .ruleCard.off { opacity: .6; }
  .nameInput { font-size: 16px; font-weight: 950; }
  .miniToggle.on { background: rgba(140,220,255,.12); border-color: rgba(140,220,255,.3); }
  .toggleRow { color: #eef1f3; padding: 13px; display: flex; gap: 12px; align-items: flex-start; text-align: left; cursor: pointer; }
  .toggleRow.on { background: rgba(140,220,255,.1); border-color: rgba(140,220,255,.28); }
  .toggleRow span:last-child { display: grid; gap: 3px; }
  .toggleRow small { color: rgba(238,241,243,.68); line-height: 1.3; }
  .dot { width: 11px; height: 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); margin-top: 3px; flex: 0 0 auto; }
  .on .dot { background: rgba(255,255,255,.82); }
  .addRow { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.24); color: #eef1f3; border-radius: 999px; padding: 8px 10px; cursor: pointer; font-weight: 900; }
  .chip span { margin-left: 7px; opacity: .55; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; }
  @media (max-width: 980px) { .topbar { display: grid; } .stats { grid-template-columns: repeat(2,minmax(0,1fr)); } .formGrid, .formGrid.compact, .toggleGrid, .twoCol, .wallGrid, .soundGrid { grid-template-columns: 1fr; } .topActions, .ruleActions, .factoryActions { justify-content: stretch; } .btn, .tab, .miniToggle { flex: 1 1 auto; } }
  @media (max-width: 560px) { .wrap { padding: 12px; } .stats { grid-template-columns: 1fr; } h1 { font-size: 38px; } }
`;
