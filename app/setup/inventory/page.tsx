"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import {
  INVENTORY_KEY,
  defaultSetupSettings,
  defaultInventoryItems,
  loadSetupSettings,
  saveSetupSettings,
  uid,
  type InventoryItem,
} from "@/lib/setupData";

function loadItems(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return defaultInventoryItems();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) && parsed.items.length
      ? parsed.items.map((item: Partial<InventoryItem>) => ({
          ...item,
          unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
        })) as InventoryItem[]
      : defaultInventoryItems();
  } catch {
    return defaultInventoryItems();
  }
}

export default function InventorySetupPage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [enableConsumables, setEnableConsumables] = useState(true);
  const [enableParts, setEnableParts] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>(defaultInventoryItems());
  const [returnStep, setReturnStep] = useState(4);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const requestedStep = Number(new URLSearchParams(window.location.search).get("returnStep"));
      if (Number.isInteger(requestedStep)) setReturnStep(requestedStep);
      const settings = loadSetupSettings();
      setEnabled(settings?.inventory?.enabled ?? true);
      setEnableConsumables(settings?.inventory?.enableConsumables ?? true);
      setEnableParts(settings?.inventory?.enableParts ?? true);
      setItems(loadItems());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const addItem = (category: "consumable" | "part", preset?: Partial<InventoryItem>) => {
    setItems((list) => [
      ...list,
      {
        id: uid(),
        name: preset?.name ?? "",
        category,
        unit: preset?.unit ?? "count",
        unitPrice: preset?.unitPrice ?? 0,
        countingMode: preset?.countingMode ?? "manual",
        tareWeight: preset?.tareWeight ?? 0,
        weightPerItem: preset?.weightPerItem ?? 0,
        quantity: preset?.quantity ?? 0,
        minThreshold: preset?.minThreshold ?? 0,
      },
    ]);
  };

  const updateItem = (id: string, patch: Partial<InventoryItem>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeItem = (id: string) => setItems((list) => list.filter((item) => item.id !== id));

  const save = () => {
    const settings = loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone);
    saveSetupSettings({
      ...settings,
      inventory: {
        enabled,
        enableConsumables,
        enableParts,
        mode: enabled ? "now" : "skip",
      },
    });

    if (enabled) {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify({ items, meta: { savedAt: new Date().toISOString() } }));
    } else {
      localStorage.removeItem(INVENTORY_KEY);
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
          <div className="micro">INVENTORY SETUP</div>
          <h1>Inventory</h1>
          <p>Add consumables, parts, paint, and materials with counts, thresholds, and optional scale-by-weight counting.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => router.push(`/setup?step=${returnStep}`)}>Return to Setup</button>
          <Link className="btn ghost" href="/dashboard" onClick={save}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <div className="switchGrid">
          <Toggle label="Enable inventory" value={enabled} onChange={setEnabled} />
          <Toggle label="Consumables / materials" value={enableConsumables} onChange={setEnableConsumables} disabled={!enabled} />
          <Toggle label="Parts" value={enableParts} onChange={setEnableParts} disabled={!enabled} />
        </div>
      </section>

      {enabled && (
        <section className="panel">
          <div className="panelTop">
            <div>
              <div className="title">Starter Items</div>
              <div className="hint">These become the first entries on the Inventory page.</div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => addItem("consumable")}>Add Consumable</button>
              <button className="btn" onClick={() => addItem("consumable", { name: "Paint material", unit: "oz" })}>Add Paint</button>
              <button className="btn" onClick={() => addItem("part")}>Add Part</button>
            </div>
          </div>

          <div className="list">
            {items.map((item) => (
              <div className="card" key={item.id}>
                <div className="cardTop">
                  <div>
                    <div className="micro">{item.category === "consumable" ? "CONSUMABLE" : "PART"}</div>
                    <input className="name" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} placeholder="Example: 3M 80 grit discs" />
                  </div>
                  <button className="x" onClick={() => removeItem(item.id)}>Remove</button>
                </div>

                <div className="grid">
                  <label className="label">Unit<input className="input" value={item.unit} onChange={(e) => updateItem(item.id, { unit: e.target.value })} placeholder="count, oz, qt, box" /></label>
                  <label className="label">Counting mode<select className="input" value={item.countingMode} onChange={(e) => updateItem(item.id, { countingMode: e.target.value as InventoryItem["countingMode"] })}><option value="manual">Manual</option><option value="scale">Scale by weight</option></select></label>
                  <label className="label">Unit price<DecimalInput className="input" value={item.unitPrice} onValueChange={(value) => updateItem(item.id, { unitPrice: value })} placeholder="0.00" /></label>
                  <label className="label">Starting quantity<DecimalInput className="input" value={item.quantity} onValueChange={(value) => updateItem(item.id, { quantity: value })} /></label>
                  <label className="label">Low-stock threshold<DecimalInput className="input" value={item.minThreshold} onValueChange={(value) => updateItem(item.id, { minThreshold: value })} /></label>
                  {item.countingMode === "scale" && (
                    <>
                      <label className="label">Tare weight (grams)<DecimalInput className="input" value={item.tareWeight} onValueChange={(value) => updateItem(item.id, { tareWeight: value })} /></label>
                      <label className="label">Weight per item (grams)<DecimalInput className="input" value={item.weightPerItem} onValueChange={(value) => updateItem(item.id, { weightPerItem: value })} /></label>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

        </section>
      )}

      <section className="panel compact">
        <div className="actions">
          <button className="btn primary" onClick={save}>Save Inventory</button>
          <button className="btn primary" onClick={continueSetup}>Save & Continue Setup</button>
        </div>
        {savedAt && <div className="saved">Saved at {savedAt}</div>}
      </section>

      <style jsx global>{styles}</style>
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

const styles = `
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
  .list { display: grid; gap: 12px; }
  .card { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; display: grid; gap: 12px; }
  .name { margin-top: 6px; min-width: min(520px, 100%); background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 12px; outline: none; font-weight: 900; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 800; }
  .input { width: 100%; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  @media (max-width: 820px) { .wrap { padding: 14px; } .top, .switchGrid, .grid { display: grid; grid-template-columns: 1fr; } .actions .btn { flex: 1 1 auto; } }
`;
