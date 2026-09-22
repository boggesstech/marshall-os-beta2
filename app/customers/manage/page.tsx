"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { CUSTOMERS_KEY, blankCustomer, blankVehicle, type Customer, type CustomerVehicle } from "@/lib/setupData";

function normalizeVehicle(raw: Partial<CustomerVehicle> | undefined): CustomerVehicle {
  const blank = blankVehicle();
  return {
    ...blank,
    ...(raw ?? {}),
    id: raw?.id ?? blank.id,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
  };
}

function normalizeCustomer(raw: Partial<Customer>): Customer {
  const blank = blankCustomer();
  const legacyVehicle = normalizeVehicle(raw.vehicle);
  const rawVehicles = Array.isArray(raw.vehicles) && raw.vehicles.length
    ? raw.vehicles.map((vehicle) => normalizeVehicle(vehicle))
    : [];
  const vehicles = rawVehicles.some(vehicleHasContent) ? rawVehicles : [legacyVehicle];

  return {
    ...blank,
    ...raw,
    business: raw.business ?? "",
    preferredContact: raw.preferredContact ?? "any",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    vehicle: vehicles[0],
    vehicles,
  };
}

function loadCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(CUSTOMERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.customers) ? parsed.customers.map(normalizeCustomer) : [];
  } catch {
    return [];
  }
}

function saveCustomers(customers: Customer[]) {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify({ customers, meta: { savedAt: new Date().toISOString() } }));
}

const parseTags = (raw: string) =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Customer>(() => blankCustomer());
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setCustomers(loadCustomers()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) => customerSearchText(customer).includes(q));
  }, [customers, query]);

  const persist = (next: Customer[]) => {
    setCustomers(next);
    saveCustomers(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const updateCustomer = (id: string, patch: Partial<Customer>) => {
    persist(customers.map((customer) => (customer.id === id ? normalizeCustomer({ ...customer, ...patch }) : customer)));
  };

  const removeCustomer = (id: string) => {
    persist(customers.filter((customer) => customer.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addCustomer = () => {
    const clean = normalizeCustomer({
      ...draft,
      name: draft.name.trim(),
      business: draft.business.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      address: draft.address.trim(),
      notes: draft.notes.trim(),
      tags: draft.tags,
      vehicles: cleanVehicles(draft.vehicles),
    });

    if (!customerHasContent(clean)) return;
    persist([clean, ...customers]);
    setDraft(blankCustomer());
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">CUSTOMERS</div>
          <h1>Manage Customers</h1>
          <p>{customers.length} customer{customers.length === 1 ? "" : "s"} on file. Edit existing records or add a new one.</p>
        </div>
        <div className="actions">
          {savedAt && <span className="saved">Saved at {savedAt}</span>}
          <Link className="btn ghost" href="/customers">Customer Home</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="workspace">
        <div className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Customer List</div>
              <div className="hint">Basic info stays visible. Use Edit to open the full record.</div>
            </div>
            <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, business, phone, vehicle, VIN..." />
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <strong>No customers found.</strong>
              <span>Add one from the form on the right.</span>
            </div>
          ) : (
            <div className="list">
              {filtered.map((customer) => {
                const isEditing = editingId === customer.id;
                return (
                  <article className={`rowCard ${isEditing ? "open" : ""}`} key={customer.id}>
                    <div className="summary">
                      <div className="summaryMain">
                        <strong>{customer.name || "Unnamed Customer"}</strong>
                        <span>{customer.business || "No business on file"}</span>
                      </div>
                      <div className="summaryStat">
                        <small>Phone</small>
                        <strong>{customer.phone || "-"}</strong>
                      </div>
                      <div className="summaryStat">
                        <small>Vehicles</small>
                        <strong>{vehicleCount(customer)}</strong>
                      </div>
                      <div className="rowActions">
                        <button className="btn small" onClick={() => setEditingId(isEditing ? null : customer.id)}>
                          {isEditing ? "Close" : "Edit"}
                        </button>
                        <button className="btn danger small" onClick={() => removeCustomer(customer.id)}>Remove</button>
                      </div>
                    </div>

                    {isEditing && (
                      <CustomerForm
                        customer={customer}
                        onChange={(patch) => updateCustomer(customer.id, patch)}
                        title="Edit Customer"
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="panel addPanel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Add Customer</div>
              <div className="hint">This saves to the live customer list, separate from setup.</div>
            </div>
          </div>
          <CustomerForm customer={draft} onChange={(patch) => setDraft((current) => normalizeCustomer({ ...current, ...patch }))} title="New Customer" />
          <button className="btn primary" onClick={addCustomer}>Add Customer</button>
        </aside>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function CustomerForm({
  customer,
  onChange,
  title,
}: {
  customer: Customer;
  onChange: (patch: Partial<Customer>) => void;
  title: string;
}) {
  const updateVehicle = (vehicleId: string, patch: Partial<CustomerVehicle>) => {
    const nextVehicles = customer.vehicles.map((vehicle) =>
      vehicle.id === vehicleId ? normalizeVehicle({ ...vehicle, ...patch }) : vehicle
    );
    onChange({ vehicles: nextVehicles, vehicle: nextVehicles[0] });
  };

  const addVehicle = () => {
    const nextVehicles = [...customer.vehicles, blankVehicle()];
    onChange({ vehicles: nextVehicles, vehicle: nextVehicles[0] });
  };

  const removeVehicle = (vehicleId: string) => {
    const nextVehicles = customer.vehicles.filter((vehicle) => vehicle.id !== vehicleId);
    const fallback = nextVehicles.length ? nextVehicles : [blankVehicle()];
    onChange({ vehicles: fallback, vehicle: fallback[0] });
  };

  return (
    <div className="formBlock">
      <div className="sectionTitle">{title}</div>
      <div className="formGrid">
        <label className="label">Name<input className="input" value={customer.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
        <label className="label">Business<input className="input" value={customer.business} onChange={(event) => onChange({ business: event.target.value })} /></label>
        <label className="label">Phone<input className="input" value={customer.phone} onChange={(event) => onChange({ phone: event.target.value })} /></label>
        <label className="label">Email<input className="input" value={customer.email} onChange={(event) => onChange({ email: event.target.value })} /></label>
        <label className="label">Preferred contact
          <select className="input" value={customer.preferredContact} onChange={(event) => onChange({ preferredContact: event.target.value as Customer["preferredContact"] })}>
            <option value="any">Any</option>
            <option value="phone">Phone</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="label">Tags<input className="input" value={customer.tags.join(", ")} onChange={(event) => onChange({ tags: parseTags(event.target.value) })} placeholder="repeat, fleet, insurance" /></label>
        <label className="label full">Address<input className="input" value={customer.address} onChange={(event) => onChange({ address: event.target.value })} /></label>
        <label className="label full">Customer notes<textarea className="textarea" value={customer.notes} onChange={(event) => onChange({ notes: event.target.value })} /></label>
      </div>

      <div className="sectionRow">
        <div className="sectionTitle">Vehicles</div>
        <button className="btn small" type="button" onClick={addVehicle}>Add Vehicle</button>
      </div>

      <div className="vehicleForms">
        {customer.vehicles.map((vehicle, index) => (
          <div className="vehicleForm" key={vehicle.id}>
            <div className="vehicleFormTop">
              <div className="sectionTitle">Vehicle {index + 1}</div>
              <button className="btn danger small" type="button" onClick={() => removeVehicle(vehicle.id)}>Remove</button>
            </div>
            <div className="formGrid">
              <label className="label">Year<input className="input" value={vehicle.year} onChange={(event) => updateVehicle(vehicle.id, { year: event.target.value })} /></label>
              <label className="label">Make<input className="input" value={vehicle.make} onChange={(event) => updateVehicle(vehicle.id, { make: event.target.value })} /></label>
              <label className="label">Model<input className="input" value={vehicle.model} onChange={(event) => updateVehicle(vehicle.id, { model: event.target.value })} /></label>
              <label className="label">Paint<input className="input" value={vehicle.paint} onChange={(event) => updateVehicle(vehicle.id, { paint: event.target.value })} /></label>
              <label className="label">VIN<input className="input" value={vehicle.vin} onChange={(event) => updateVehicle(vehicle.id, { vin: event.target.value })} /></label>
              <label className="label">Plate<input className="input" value={vehicle.plate} onChange={(event) => updateVehicle(vehicle.id, { plate: event.target.value })} /></label>
              <label className="label full">Vehicle tags<input className="input" value={vehicle.tags.join(", ")} onChange={(event) => updateVehicle(vehicle.id, { tags: parseTags(event.target.value) })} placeholder="rust repair, cab, blend" /></label>
              <label className="label full">Vehicle notes<textarea className="textarea" value={vehicle.notes} onChange={(event) => updateVehicle(vehicle.id, { notes: event.target.value })} /></label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function customerSearchText(customer: Customer) {
  return [
    customer.name,
    customer.business,
    customer.phone,
    customer.email,
    customer.address,
    customer.preferredContact,
    customer.notes,
    ...customer.tags,
    ...customer.vehicles.flatMap((vehicle) => [
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.paint,
      vehicle.vin,
      vehicle.plate,
      vehicle.notes,
      ...vehicle.tags,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function vehicleTitle(customer: Customer) {
  const primary = customer.vehicles[0] ?? customer.vehicle;
  const parts = [primary.year, primary.make, primary.model].filter(Boolean);
  return parts.length ? parts.join(" ") : "";
}

function vehicleCount(customer: Customer) {
  return String(customer.vehicles.filter(vehicleHasContent).length);
}

function vehicleHasContent(vehicle: CustomerVehicle) {
  return Boolean(
    vehicle.year ||
      vehicle.make ||
      vehicle.model ||
      vehicle.paint ||
      vehicle.vin ||
      vehicle.plate ||
      vehicle.notes ||
      vehicle.tags.length
  );
}

function cleanVehicles(vehicles: CustomerVehicle[]) {
  const cleaned = vehicles
    .map((vehicle) =>
      normalizeVehicle({
        ...vehicle,
        year: vehicle.year.trim(),
        make: vehicle.make.trim(),
        model: vehicle.model.trim(),
        paint: vehicle.paint.trim(),
        vin: vehicle.vin.trim(),
        plate: vehicle.plate.trim(),
        notes: vehicle.notes.trim(),
        tags: vehicle.tags,
      })
    )
    .filter(vehicleHasContent);

  return cleaned.length ? cleaned : [blankVehicle()];
}

function customerHasContent(customer: Customer) {
  return Boolean(
    customer.name ||
      customer.business ||
      customer.phone ||
      customer.email ||
      customer.address ||
      customer.notes ||
      customer.tags.length ||
      vehicleTitle(customer) ||
      customer.vehicles.some(vehicleHasContent)
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 22px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .workspace { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 4px 0 0; font-size: 38px; line-height: 1; }
  p, .hint { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin: 8px 0 0; }
  .actions, .rowActions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .small { padding: 8px 10px; font-size: 12px; }
  .ghost { background: rgba(255,255,255,.05); }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .danger { background: rgba(255,80,80,.12); border-color: rgba(255,80,80,.28); }
  .workspace { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(360px, .75fr); gap: 12px; align-items: start; }
  .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); display: grid; gap: 14px; }
  .addPanel { position: sticky; top: 16px; }
  .panelHead { display: grid; gap: 10px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .search, .input, .textarea { width: 100%; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; font-family: inherit; }
  .textarea { min-height: 78px; resize: vertical; }
  .empty { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; padding: 18px; display: grid; gap: 5px; }
  .empty span { opacity: .72; font-size: 13px; }
  .list { display: grid; gap: 10px; }
  .rowCard { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; overflow: hidden; display: grid; }
  .rowCard.open { border-color: rgba(255,255,255,.24); background: rgba(255,255,255,.08); }
  .summary { padding: 12px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(130px, auto) minmax(90px, auto) auto; gap: 10px; align-items: center; }
  .summaryMain { display: grid; gap: 3px; min-width: 0; }
  .summaryMain strong { font-size: 16px; overflow-wrap: anywhere; }
  .summaryMain span { opacity: .72; font-size: 13px; overflow-wrap: anywhere; }
  .summaryStat { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); border-radius: 8px; padding: 8px 9px; display: grid; gap: 3px; }
  .summaryStat small, .sectionTitle { opacity: .64; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 900; }
  .summaryStat strong { font-size: 12px; overflow-wrap: anywhere; }
  .formBlock { border-top: 1px solid rgba(255,255,255,.1); padding: 14px; display: grid; gap: 12px; }
  .addPanel .formBlock { border-top: 0; padding: 0; }
  .formGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .sectionRow, .vehicleFormTop { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .vehicleForms { display: grid; gap: 10px; }
  .vehicleForm { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.18); border-radius: 10px; padding: 12px; display: grid; gap: 10px; }
  .label { display: grid; gap: 6px; font-size: 12px; font-weight: 850; }
  .full { grid-column: 1 / -1; }
  @media (max-width: 980px) { .wrap { padding: 14px; } .topbar, .workspace { display: grid; grid-template-columns: 1fr; } .addPanel { position: static; } .actions, .rowActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .summary, .formGrid { grid-template-columns: 1fr; } }
`;
