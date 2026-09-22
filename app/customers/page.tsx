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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setCustomers(loadCustomers()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) => customerSearchText(customer).includes(q));
  }, [customers, query]);

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">CUSTOMERS</div>
          <h1>Customer Home</h1>
          <p>{customers.length} customer{customers.length === 1 ? "" : "s"} on file. Click a customer to view full details.</p>
        </div>
        <div className="actions">
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
          <Link className="btn" href="/customers/manage">Edit / Add Customers</Link>
        </div>
      </header>

      <section className="panel">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customers, business, phone, vehicle, VIN, paint, tags..."
        />

        {filtered.length === 0 ? (
          <div className="empty">
            <strong>No customers found.</strong>
            <span>Add customers from the edit/add page, then they will appear here.</span>
          </div>
        ) : (
          <div className="list">
            {filtered.map((customer) => {
              const isExpanded = expandedId === customer.id;
              return (
                <article className={`card ${isExpanded ? "open" : ""}`} key={customer.id}>
                  <button
                    className="summaryButton"
                    onClick={() => setExpandedId((current) => (current === customer.id ? null : customer.id))}
                    aria-expanded={isExpanded}
                  >
                    <span className="summaryMain">
                      <span className="nameLine">
                        <span className="name">{customer.name || "Unnamed Customer"}</span>
                        {customer.tags.length > 0 && (
                          <span className="summaryTags">
                            {customer.tags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="sub">{customer.business || "No business on file"}</span>
                    </span>

                    <span className="summaryMeta">
                      <span>
                        <small>Phone</small>
                        <strong>{customer.phone || "-"}</strong>
                      </span>
                      <span>
                        <small>Vehicles</small>
                        <strong>{vehicleCount(customer)}</strong>
                      </span>
                      <span className="expandText">{isExpanded ? "Collapse" : "Details"}</span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="expanded">
                      <div className="details">
                        <Info label="Preferred contact" value={contactLabel(customer.preferredContact)} />
                        <Info label="Phone" value={customer.phone} />
                        <Info label="Email" value={customer.email} />
                        <Info label="Address" value={customer.address} />
                      </div>

                      {customer.notes && (
                        <div className="notes customerNotes">
                          <div className="sectionTitle">Customer Notes</div>
                          <p>{customer.notes}</p>
                        </div>
                      )}

                      <div className="vehicleList">
                        {customer.vehicles.filter(vehicleHasContent).length === 0 ? (
                          <div className="vehicle">
                            <div className="sectionTitle">Vehicle</div>
                            <div className="vehicleTitle">No vehicle added</div>
                          </div>
                        ) : (
                          customer.vehicles.filter(vehicleHasContent).map((vehicle, index) => (
                            <div className="vehicle" key={vehicle.id}>
                              <div className="sectionTitle">Vehicle {index + 1}</div>
                              <div className="vehicleTitle">{vehicleTitleFromVehicle(vehicle) || "Untitled vehicle"}</div>
                              <div className="details">
                                <Info label="Paint" value={vehicle.paint} />
                                <Info label="VIN" value={vehicle.vin} />
                                <Info label="Plate" value={vehicle.plate} />
                              </div>
                              {vehicle.tags.length > 0 && (
                                <div className="tags vehicleTags">
                                  {vehicle.tags.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                </div>
                              )}
                              {vehicle.notes && (
                                <div className="notes vehicleNotes">
                                  <div className="sectionTitle">Vehicle Notes</div>
                                  <p>{vehicle.notes}</p>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function contactLabel(value: Customer["preferredContact"]) {
  if (value === "phone") return "Phone";
  if (value === "text") return "Text";
  if (value === "email") return "Email";
  return "Any contact";
}

function vehicleTitleFromVehicle(vehicle: CustomerVehicle) {
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.join(" ");
}

function vehicleCount(customer: Customer) {
  return String(customer.vehicles.filter((vehicle) => vehicleTitleFromVehicle(vehicle) || vehicle.vin || vehicle.plate || vehicle.paint).length);
}

function vehicleHasContent(vehicle: CustomerVehicle) {
  return Boolean(vehicleTitleFromVehicle(vehicle) || vehicle.paint || vehicle.vin || vehicle.plate || vehicle.notes || vehicle.tags.length);
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 22px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .panel { width: min(1180px, 100%); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); }
  .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 4px 0 0; font-size: 38px; line-height: 1; }
  p { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin: 8px 0 0; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .ghost { background: rgba(255,255,255,.05); }
  .panel { display: grid; gap: 14px; }
  .search { width: 100%; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 12px; outline: none; }
  .empty { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; padding: 18px; display: grid; gap: 5px; }
  .empty span { opacity: .72; font-size: 13px; }
  .list { display: grid; gap: 10px; }
  .card { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; display: grid; overflow: hidden; }
  .card.open { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.22); }
  .summaryButton { width: 100%; border: 0; background: transparent; color: #eef1f3; padding: 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; cursor: pointer; text-align: left; }
  .summaryMain { display: grid; gap: 4px; min-width: 0; }
  .nameLine { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; min-width: 0; }
  .summaryTags { display: flex; flex-wrap: wrap; gap: 6px; }
  .summaryTags span { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.08); border-radius: 999px; padding: 5px 7px; font-size: 10px; font-weight: 900; }
  .summaryMeta { display: grid; grid-template-columns: minmax(110px, auto) minmax(80px, auto) auto; gap: 10px; align-items: center; }
  .summaryMeta span:not(.expandText) { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.18); border-radius: 8px; padding: 8px 9px; display: grid; gap: 3px; min-width: 0; }
  .summaryMeta small { opacity: .62; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; font-weight: 900; }
  .summaryMeta strong { font-size: 12px; overflow-wrap: anywhere; }
  .expandText { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 11px; font-weight: 950; white-space: nowrap; }
  .expanded { border-top: 1px solid rgba(255,255,255,.1); padding: 14px; display: grid; gap: 13px; }
  .name { font-size: 18px; font-weight: 1000; }
  .sub { opacity: .72; font-size: 13px; margin-top: 3px; }
  .details { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .info { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); border-radius: 8px; padding: 9px; display: grid; gap: 4px; min-width: 0; }
  .info span, .sectionTitle { opacity: .64; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 900; }
  .info strong { font-size: 12px; overflow-wrap: anywhere; }
  .vehicle { display: grid; gap: 8px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 12px; }
  .vehicleList { display: grid; gap: 10px; }
  .vehicleTitle { font-weight: 1000; }
  .tags { display: flex; flex-wrap: wrap; gap: 7px; }
  .tags span { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.08); border-radius: 999px; padding: 6px 8px; font-size: 11px; font-weight: 900; }
  .notes { border-top: 1px solid rgba(255,255,255,.1); padding-top: 10px; display: grid; gap: 6px; }
  .vehicleTags { padding-top: 2px; }
  .customerNotes { margin-top: -2px; }
  .vehicleNotes { margin-top: 2px; }
  .notes p { margin: 0; }
  @media (max-width: 900px) { .wrap { padding: 14px; } .topbar { display: grid; } .actions { justify-content: stretch; } .btn { flex: 1 1 auto; } .summaryButton, .summaryMeta, .details { grid-template-columns: 1fr; } }
`;
