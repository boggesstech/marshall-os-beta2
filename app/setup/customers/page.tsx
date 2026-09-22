"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import {
  CUSTOMERS_KEY,
  blankCustomer,
  defaultSetupSettings,
  loadSetupSettings,
  saveSetupSettings,
  type Customer,
} from "@/lib/setupData";

function loadCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(CUSTOMERS_KEY);
    if (!raw) return [blankCustomer()];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.customers) && parsed.customers.length
      ? parsed.customers.map(normalizeCustomer)
      : [blankCustomer()];
  } catch {
    return [blankCustomer()];
  }
}

function normalizeCustomer(raw: Partial<Customer>): Customer {
  const blank = blankCustomer();
  return {
    ...blank,
    ...raw,
    business: raw.business ?? "",
    preferredContact: raw.preferredContact ?? "any",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    vehicle: {
      ...blank.vehicle,
      ...(raw.vehicle ?? {}),
      tags: Array.isArray(raw.vehicle?.tags) ? raw.vehicle.tags : [],
    },
  };
}

const parseTags = (raw: string) =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function CustomerSetupPage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [allowLinking, setAllowLinking] = useState(true);
  const [requireCustomer, setRequireCustomer] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([blankCustomer()]);
  const [returnStep, setReturnStep] = useState(6);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const requestedStep = Number(new URLSearchParams(window.location.search).get("returnStep"));
      if (Number.isInteger(requestedStep)) setReturnStep(requestedStep);
      const settings = loadSetupSettings();
      setEnabled(settings?.customers?.enabled ?? true);
      setAllowLinking(settings?.customers?.allowJobCustomerLinking ?? true);
      setRequireCustomer(settings?.customers?.requireCustomerOnJobs ?? false);
      setCustomers(loadCustomers());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const addCustomer = () => setCustomers((list) => [...list, blankCustomer()]);
  const updateCustomer = (id: string, patch: Partial<Customer>) =>
    setCustomers((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCustomer = (id: string) => setCustomers((list) => list.filter((c) => c.id !== id));

  const save = () => {
    const clean = customers
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        business: c.business.trim(),
        phone: c.phone.trim(),
        email: c.email.trim(),
        address: c.address.trim(),
        notes: c.notes.trim(),
        vehicle: {
          ...c.vehicle,
          make: c.vehicle.make.trim(),
          model: c.vehicle.model.trim(),
          year: c.vehicle.year.trim(),
          paint: c.vehicle.paint.trim(),
          vin: c.vehicle.vin.trim(),
          plate: c.vehicle.plate.trim(),
          notes: c.vehicle.notes.trim(),
        },
      }))
      .filter(
        (c) =>
          c.name ||
          c.business ||
          c.phone ||
          c.email ||
          c.address ||
          c.notes ||
          c.tags.length ||
          c.vehicle.make ||
          c.vehicle.model ||
          c.vehicle.year ||
          c.vehicle.paint ||
          c.vehicle.vin ||
          c.vehicle.plate ||
          c.vehicle.notes ||
          c.vehicle.tags.length
      );

    const settings = loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone);
    saveSetupSettings({
      ...settings,
      customers: {
        enabled,
        allowJobCustomerLinking: allowLinking,
        requireCustomerOnJobs: requireCustomer,
      },
    });

    if (enabled) {
      localStorage.setItem(CUSTOMERS_KEY, JSON.stringify({ customers: clean, meta: { savedAt: new Date().toISOString() } }));
    } else {
      localStorage.removeItem(CUSTOMERS_KEY);
    }
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
            <div className="micro">CUSTOMER SETUP</div>
            <h1>Customers</h1>
          <p>Add the people, businesses, preferred contact methods, vehicle details, tags, and notes you already know.</p>
          </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => router.push(`/setup?step=${returnStep}`)}>Return to Setup</button>
          <Link className="btn ghost" href="/dashboard" onClick={save}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <div className="switchGrid">
          <Toggle label="Enable customer tracking" value={enabled} onChange={setEnabled} />
          <Toggle label="Allow jobs to link customers" value={allowLinking} onChange={setAllowLinking} disabled={!enabled} />
          <Toggle label="Require customer on new jobs" value={requireCustomer} onChange={setRequireCustomer} disabled={!enabled} />
        </div>
      </section>

      {enabled && (
        <section className="panel">
          <div className="panelTop">
            <div>
              <div className="title">Starter Customers</div>
              <div className="hint">Blank cards are ignored when you save.</div>
            </div>
            <button className="btn" onClick={addCustomer}>Add Customer</button>
          </div>

          <div className="list">
            {customers.map((c, index) => (
              <div className="card" key={c.id}>
                <div className="cardTop">
                  <div>
                    <div className="micro">CUSTOMER {index + 1}</div>
                    <input className="name" value={c.name} onChange={(e) => updateCustomer(c.id, { name: e.target.value })} placeholder="Customer name" />
                  </div>
                  <button className="x" onClick={() => removeCustomer(c.id)}>Remove</button>
                </div>
                <div className="grid">
                  <label className="label">Business<input className="input" value={c.business} onChange={(e) => updateCustomer(c.id, { business: e.target.value })} placeholder="Business / company" /></label>
                  <label className="label">Phone<input className="input" value={c.phone} onChange={(e) => updateCustomer(c.id, { phone: e.target.value })} placeholder="270-000-0000" /></label>
                  <label className="label">Email<input className="input" value={c.email} onChange={(e) => updateCustomer(c.id, { email: e.target.value })} placeholder="customer@email.com" /></label>
                  <label className="label">Preferred contact
                    <select className="input" value={c.preferredContact} onChange={(e) => updateCustomer(c.id, { preferredContact: e.target.value as Customer["preferredContact"] })}>
                      <option value="any">Any</option>
                      <option value="phone">Phone</option>
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                    </select>
                  </label>
                  <label className="label">Address<input className="input" value={c.address} onChange={(e) => updateCustomer(c.id, { address: e.target.value })} placeholder="Optional" /></label>
                  <label className="label">Customer tags<input className="input" value={c.tags.join(", ")} onChange={(e) => updateCustomer(c.id, { tags: parseTags(e.target.value) })} placeholder="repeat, fleet, insurance" /></label>
                </div>

                <div className="sectionTitle">Vehicle</div>
                <div className="grid">
                  <label className="label">Year<input className="input" value={c.vehicle.year} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, year: e.target.value } })} placeholder="2002" /></label>
                  <label className="label">Make<input className="input" value={c.vehicle.make} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, make: e.target.value } })} placeholder="Ford" /></label>
                  <label className="label">Model<input className="input" value={c.vehicle.model} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, model: e.target.value } })} placeholder="F-250" /></label>
                  <label className="label">Paint / color<input className="input" value={c.vehicle.paint} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, paint: e.target.value } })} placeholder="Oxford White / paint code" /></label>
                  <label className="label">VIN<input className="input" value={c.vehicle.vin} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, vin: e.target.value } })} placeholder="17 characters" /></label>
                  <label className="label">Plate<input className="input" value={c.vehicle.plate} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, plate: e.target.value } })} placeholder="Plate number" /></label>
                  <label className="label full">Vehicle tags<input className="input" value={c.vehicle.tags.join(", ")} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, tags: parseTags(e.target.value) } })} placeholder="rust repair, cab, blend" /></label>
                  <label className="label full">Vehicle notes<textarea className="textarea" value={c.vehicle.notes} onChange={(e) => updateCustomer(c.id, { vehicle: { ...c.vehicle, notes: e.target.value } })} placeholder="Paint notes, damage notes, special handling, parts waiting, etc." /></label>
                  <label className="label full">Customer notes<textarea className="textarea" value={c.notes} onChange={(e) => updateCustomer(c.id, { notes: e.target.value })} placeholder="Preferred schedule, billing notes, repeat customer details, etc." /></label>
                </div>
              </div>
            ))}
          </div>

        </section>
      )}

      <section className="panel compact">
        <div className="actions">
          <button className="btn primary" onClick={save}>Save Customers</button>
          <button className="btn primary" onClick={continueSetup}>Save & Continue Setup</button>
        </div>
        {savedAt && <div className="saved">Saved at {savedAt}</div>}
      </section>

      <style jsx global>{pageStyles}</style>
    </main>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button className={`toggle ${value ? "on" : ""}`} onClick={() => !disabled && onChange(!value)} disabled={disabled}>
      <span className="dot" />
      <span>{label}</span>
    </button>
  );
}

const pageStyles = `
  .wrap { min-height: 100vh; padding: 24px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.4)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .top, .panel { width: min(1040px, 100%); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); }
  .compact { padding: 14px 18px; }
  .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: 38px; line-height: 1; }
  p, .hint { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin: 8px 0 0; }
  .actions, .panelTop, .cardTop { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
  .saved { justify-self: end; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; }
  .btn, .x { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .ghost { background: rgba(255,255,255,.05); }
  .switchGrid, .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .toggle { min-height: 58px; text-align: left; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 12px; cursor: pointer; font-weight: 900; }
  .toggle:disabled { opacity: .45; cursor: not-allowed; }
  .dot { width: 10px; height: 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); flex: 0 0 auto; }
  .toggle.on .dot { background: rgba(255,255,255,.8); }
  .title { font-size: 18px; font-weight: 1000; }
  .sectionTitle { font-size: 13px; font-weight: 1000; letter-spacing: 1px; text-transform: uppercase; opacity: .72; border-top: 1px solid rgba(255,255,255,.1); padding-top: 12px; }
  .list { display: grid; gap: 12px; }
  .card { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; display: grid; gap: 12px; }
  .name { margin-top: 6px; min-width: min(520px, 100%); background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 12px; outline: none; font-weight: 900; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 800; }
  .input, .textarea { width: 100%; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; font-family: inherit; }
  .textarea { min-height: 88px; resize: vertical; }
  .full { grid-column: 1 / -1; }
  @media (max-width: 820px) { .wrap { padding: 14px; } .top, .switchGrid, .grid { grid-template-columns: 1fr; } .top { display: grid; } .actions .btn { flex: 1 1 auto; } }
`;
