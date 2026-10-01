"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepareBootAudio } from "@/lib/bootAudio";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { INVENTORY_KEY, loadSetupSettings, n, uid, type InventoryItem } from "@/lib/setupData";
import {
  MARSHAL_INVENTORY_DASHBOARD_MESSAGE_KEY,
  MARSHAL_INVENTORY_INCIDENT_KEY,
  MARSHAL_INVENTORY_INTRODUCED_KEY,
  MARSHAL_INVENTORY_REPEAT_KEY,
  PUMP_SPRAYER_AUDIO_TRIGGERED_KEY,
  PUMP_SPRAYER_AUDIO_URL,
  genericInventoryEgg,
  isMarshalInventoryName,
  isPumpSprayerInventoryName,
  pumpSprayerInventoryEgg,
} from "@/lib/inventoryEasterEggs";

type CategoryFilter = "all" | InventoryItem["category"];

const blankItem = (category: InventoryItem["category"] = "consumable"): InventoryItem => ({
  id: uid(),
  name: "",
  category,
  unit: "count",
  unitPrice: 0,
  countingMode: "manual",
  tareWeight: 0,
  weightPerItem: 0,
  quantity: 0,
  minThreshold: 0,
});

function normalizeItem(raw: Partial<InventoryItem>): InventoryItem {
  return {
    ...blankItem(raw.category ?? "consumable"),
    ...raw,
    unitPrice: Number.isFinite(Number(raw.unitPrice)) ? Number(raw.unitPrice) : 0,
    tareWeight: Number.isFinite(Number(raw.tareWeight)) ? Number(raw.tareWeight) : 0,
    weightPerItem: Number.isFinite(Number(raw.weightPerItem)) ? Number(raw.weightPerItem) : 0,
    quantity: Number.isFinite(Number(raw.quantity)) ? Number(raw.quantity) : 0,
    minThreshold: Number.isFinite(Number(raw.minThreshold)) ? Number(raw.minThreshold) : 0,
  };
}

function loadInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items.map(normalizeItem) : [];
  } catch {
    return [];
  }
}

function saveInventory(items: InventoryItem[]) {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify({ items, meta: { savedAt: new Date().toISOString() } }));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function inventorySassEnabled() {
  return loadSetupSettings()?.ui?.sassEnabled ?? true;
}

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryFilter>("all");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InventoryItem>(() => blankItem());
  const [savedAt, setSavedAt] = useState("");
  const [eggModal, setEggModal] = useState<{ message: string; button: string } | null>(null);
  const eggResolver = useRef<(() => void) | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setItems(loadInventory()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (cat !== "all" && item.category !== cat) return false;
      if (onlyLow && item.quantity > item.minThreshold) return false;
      if (!q) return true;
      return `${item.name} ${item.unit} ${item.category} ${item.countingMode}`.toLowerCase().includes(q);
    });
  }, [cat, items, onlyLow, query]);

  const counts = useMemo(() => {
    const consumables = items.filter((item) => item.category === "consumable").length;
    const parts = items.filter((item) => item.category === "part").length;
    const low = items.filter((item) => item.quantity <= item.minThreshold).length;
    const value = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return { total: items.length, consumables, parts, low, value };
  }, [items]);

  const persist = (next: InventoryItem[]) => {
    setItems(next);
    saveInventory(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const showEgg = (message: string, button: string, onContinue?: () => void) =>
    new Promise<void>((resolve) => {
      eggResolver.current = () => {
        onContinue?.();
        resolve();
      };
      setEggModal({ message, button });
    });

  const showWaitThenBoot = (sourceId?: string) => {
    eggResolver.current = null;
    setEggModal({ message: "WAIT—", button: "" });
    window.setTimeout(() => {
      setEggModal(null);
      startMarshalBoot(sourceId);
    }, 850);
  };

  const closeEgg = () => {
    const resolve = eggResolver.current;
    eggResolver.current = null;
    setEggModal(null);
    resolve?.();
  };

  const showEggSequence = async (egg: NonNullable<ReturnType<typeof genericInventoryEgg>>) => {
    const sequence = Array.isArray(egg) ? egg : [egg];
    for (const item of sequence) {
      await showEgg(item.message, item.button);
    }
  };

  const playPumpSprayerAudioOnce = () => {
    if (localStorage.getItem(PUMP_SPRAYER_AUDIO_TRIGGERED_KEY) === "true") return;
    localStorage.setItem(PUMP_SPRAYER_AUDIO_TRIGGERED_KEY, "true");
    const audio = new Audio(PUMP_SPRAYER_AUDIO_URL);
    audio.volume = 0.9;
    audio.play().catch(() => {});
  };

  const startAdd = (category: InventoryItem["category"]) => {
    setEditingId(null);
    setDraft(blankItem(category));
  };

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setDraft(item);
  };

  const startMarshalBoot = (sourceId?: string) => {
    const withoutMarshal = items.filter((item) => item.id !== sourceId && !isMarshalInventoryName(item.name));
    persist(withoutMarshal);
    localStorage.setItem(MARSHAL_INVENTORY_INCIDENT_KEY, "true");
    localStorage.setItem(
      MARSHAL_INVENTORY_DASHBOARD_MESSAGE_KEY,
      "Close one. I removed Marshal out of the list, it's just too risky."
    );
    setEditingId(null);
    setDraft(blankItem());
    router.push("/?marshalInventoryBoot=1");
  };

  const handleMarshalItem = async (item: InventoryItem) => {
    const hadIncident = localStorage.getItem(MARSHAL_INVENTORY_INCIDENT_KEY) === "true";

    if (hadIncident) {
      const attempts = Number(localStorage.getItem(MARSHAL_INVENTORY_REPEAT_KEY) ?? "0") + 1;
      localStorage.setItem(MARSHAL_INVENTORY_REPEAT_KEY, String(attempts));

      if (attempts === 1) {
        await showEgg("Oh nonononononononono. Not again.", ":)");
        await showEgg("Dude.", "What?");
        await showEgg("You KNOW what.", "Add Marshal");
        await showEgg("No.", "Okay");
      } else {
        await showEgg("I'm not doing this with you.", "Fine.");
      }
      return false;
    }

    const introduced = localStorage.getItem(MARSHAL_INVENTORY_INTRODUCED_KEY) === "true" ||
      items.some((existing) => isMarshalInventoryName(existing.name));
    localStorage.setItem(MARSHAL_INVENTORY_INTRODUCED_KEY, "true");
    if (!introduced) await showEgg("Hey! I'm not inventory!", "Okay, okay");

    if (item.quantity === 0) {
      await showEgg("D:", "Undo");
      return false;
    }

    if (item.quantity >= 2) {
      await showEgg("Oh cool", "Nice", prepareBootAudio);
      showWaitThenBoot(editingId ?? item.id);
      return false;
    }

    return true;
  };

  const saveDraft = async () => {
    const clean = {
      ...draft,
      name: draft.name.trim(),
      unit: draft.unit.trim() || "count",
    };

    if (!clean.name) {
      await showEgg("Item name is required.", "Okay");
      return;
    }

    if (clean.quantity < 0) {
      await showEgg("Quantity cannot be negative.", "Okay");
      return;
    }

    const sassEnabled = inventorySassEnabled();
    if (!sassEnabled) {
      const savedItem = editingId ? clean : { ...clean, id: uid() };
      const next = editingId
        ? items.map((item) => (item.id === editingId ? savedItem : item))
        : [...items, savedItem];
      persist(next);
      setEditingId(savedItem.id);
      setDraft(savedItem);
      return;
    }

    const validationEgg = genericInventoryEgg(clean);
    const blocksSave = Array.isArray(validationEgg)
      ? validationEgg.some((egg) => egg.blocksSave)
      : Boolean(validationEgg?.blocksSave);

    if (validationEgg && blocksSave) {
      await showEggSequence(validationEgg);
      return;
    }

    if (isMarshalInventoryName(clean.name)) {
      const shouldSaveMarshal = await handleMarshalItem(clean);
      if (!shouldSaveMarshal) return;
    } else if (editingId && isPumpSprayerInventoryName(clean.name)) {
      const previous = items.find((item) => item.id === editingId);
      const pumpEgg = previous ? pumpSprayerInventoryEgg(Number(previous.quantity), Number(clean.quantity)) : null;
      if (pumpEgg) {
        const sequence = Array.isArray(pumpEgg) ? pumpEgg : [pumpEgg];
        if (sequence.some((egg) => egg.message === "STOP BREAKING THE LAW, ASSHOLE!")) {
          playPumpSprayerAudioOnce();
        }
        await showEggSequence(pumpEgg);
      } else if (validationEgg) {
        await showEggSequence(validationEgg);
      }
    } else if (validationEgg) {
      await showEggSequence(validationEgg);
    }

    const savedItem = editingId ? clean : { ...clean, id: uid() };
    const next = editingId
      ? items.map((item) => (item.id === editingId ? savedItem : item))
      : [...items, savedItem];
    persist(next);
    setEditingId(savedItem.id);
    setDraft(savedItem);
  };

  const removeItem = (id: string) => {
    const next = items.filter((item) => item.id !== id);
    persist(next);
    if (editingId === id) {
      setEditingId(null);
      setDraft(blankItem());
    }
  };

  const applyScaleWeight = (totalWeightGrams: number) => {
    const net = Math.max(0, totalWeightGrams - draft.tareWeight);
    const quantity = draft.weightPerItem > 0 ? Math.floor(net / draft.weightPerItem) : 0;
    setDraft((item) => ({ ...item, quantity }));
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="head">
        <div className="brand">
          <img className="logo" src="/marshall-os.svg" alt="MARshall OS" />
          <div className="brandText">
            <div className="micro">INVENTORY</div>
            <h1>Inventory</h1>
            <div className="sub">
              {counts.total} items - {counts.consumables} consumables - {counts.parts} parts -{" "}
              <span className={counts.low ? "low" : ""}>{counts.low} low</span> - {money(counts.value)} on hand
            </div>
          </div>
        </div>
        <div className="topActions">
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
          <button className="btn" onClick={() => startAdd("consumable")}>Add Consumable</button>
          <button className="btn" onClick={() => startAdd("part")}>Add Part</button>
        </div>
      </header>

      <div className="workspace">
        <section className="panel listPanel">
          <div className="controls">
            <input
              className="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory..."
            />
            <div className="filters">
              <button className={`chip ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")}>All</button>
              <button className={`chip ${cat === "consumable" ? "on" : ""}`} onClick={() => setCat("consumable")}>Consumables</button>
              <button className={`chip ${cat === "part" ? "on" : ""}`} onClick={() => setCat("part")}>Parts</button>
              <button className={`chip ${onlyLow ? "on warn" : ""}`} onClick={() => setOnlyLow((value) => !value)}>Low Stock</button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              No inventory items match.
              <span>Use the add section to create the first one.</span>
            </div>
          ) : (
            <div className="inventoryList">
              {filtered.map((item) => {
                const isLow = item.quantity <= item.minThreshold;
                return (
                  <article className={`itemRow ${isLow ? "lowBorder" : ""}`} key={item.id}>
                    <div className="itemMain">
                      <div className="itemNameLine">
                        <strong>{item.name || "Unnamed item"}</strong>
                        <span className={`tag ${item.category}`}>{item.category}</span>
                        {isLow && <span className="tag lowtag">low</span>}
                      </div>
                      <div className="itemMeta">
                        <span>{item.quantity} {item.unit} on hand</span>
                        <span>{money(item.unitPrice)} / {item.unit}</span>
                        <span>{item.countingMode === "scale" ? "Scale counted" : "Manual count"}</span>
                        <span>Low at {item.minThreshold}</span>
                      </div>
                    </div>
                    <div className="rowActions">
                      <button className="btn ghost" onClick={() => startEdit(item)}>Edit</button>
                      <button className="x" onClick={() => removeItem(item.id)}>Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel editorPanel">
          <div className="panelTop">
            <div>
              <div className="title">{editingId ? "Edit Item" : "Add Item"}</div>
              <div className="hint">Unit price is saved for later material billing on jobs.</div>
            </div>
            <div className="topActions">
              <button className="btn ghost" onClick={() => startAdd("consumable")}>New Consumable</button>
              <button className="btn ghost" onClick={() => startAdd("part")}>New Part</button>
            </div>
          </div>

          <InventoryForm item={draft} onChange={setDraft} onApplyWeight={applyScaleWeight} />

          <div className="actions">
            <button className="btn primary" onClick={saveDraft}>{editingId ? "Save Changes" : "Add Item"}</button>
            <button className="btn ghost" onClick={() => { setEditingId(null); setDraft(blankItem()); }}>Clear</button>
            {savedAt && <span className="saved">Saved at {savedAt}</span>}
          </div>
        </section>
      </div>

      <style jsx global>{styles}</style>

      {eggModal && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Inventory message">
          <div className="modal">
            <div className="modalBrand">MARSHAL INVENTORY</div>
            <div className="modalText">{eggModal.message}</div>
            {eggModal.button && (
              <div className="modalActions">
                <button className="btn primary" autoFocus onClick={closeEgg}>{eggModal.button}</button>
              </div>
            )}
          </div>
        </div>
      )}

    </main>
  );
}

function InventoryForm({
  item,
  onChange,
  onApplyWeight,
}: {
  item: InventoryItem;
  onChange: (item: InventoryItem | ((current: InventoryItem) => InventoryItem)) => void;
  onApplyWeight: (totalWeightGrams: number) => void;
}) {
  const [weight, setWeight] = useState("");
  const patch = (patchValue: Partial<InventoryItem>) => onChange((current) => ({ ...current, ...patchValue }));

  return (
    <div className="formGrid">
      <label className="label full">Item name<input className="input" value={item.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Example: 3M 80 grit discs" /></label>
      <label className="label">Category<select className="input" value={item.category} onChange={(event) => patch({ category: event.target.value as InventoryItem["category"] })}><option value="consumable">Consumable / Material</option><option value="part">Part</option></select></label>
      <label className="label">Unit<input className="input" value={item.unit} onChange={(event) => patch({ unit: event.target.value })} placeholder="count, oz, qt, box" /></label>
      <label className="label">Unit price<DecimalInput className="input" value={item.unitPrice} onValueChange={(value) => patch({ unitPrice: value })} placeholder="0.00" /></label>
      <label className="label">On-hand quantity<DecimalInput className="input" value={item.quantity} onValueChange={(value) => patch({ quantity: value })} /></label>
      <label className="label">Low-stock threshold<DecimalInput className="input" value={item.minThreshold} onValueChange={(value) => patch({ minThreshold: value })} /></label>
      <label className="label">Counting mode<select className="input" value={item.countingMode} onChange={(event) => patch({ countingMode: event.target.value as InventoryItem["countingMode"] })}><option value="manual">Manual</option><option value="scale">Scale by weight</option></select></label>

      {item.countingMode === "scale" && (
        <>
          <label className="label">Tare weight (grams)<DecimalInput className="input" value={item.tareWeight} onValueChange={(value) => patch({ tareWeight: value })} /></label>
          <label className="label">Weight per item (grams)<DecimalInput className="input" value={item.weightPerItem} onValueChange={(value) => patch({ weightPerItem: value })} /></label>
          <div className="weighBox">
            <label className="label">Total weight now<input className="input" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="grams" /></label>
            <button className="btn ghost" disabled={item.weightPerItem <= 0} onClick={() => onApplyWeight(n(weight))}>Apply Weight</button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 22px; color: #e8eaed; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.36)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 16px; align-content: start; }
  .head, .workspace { width: min(1180px, 100%); margin: 0 auto; }
  .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.38); border-radius: 16px; padding: 16px; backdrop-filter: blur(8px); box-shadow: 0 18px 60px rgba(0,0,0,.22); min-width: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .workspace { display: grid; grid-template-columns: minmax(0, 3fr) minmax(340px, 2fr); gap: 16px; align-items: start; }
  .listPanel { min-height: calc(100vh - 150px); }
  .editorPanel { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto; display: grid; gap: 14px; }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .logo { height: 48px; width: auto; filter: drop-shadow(0 8px 16px rgba(0,0,0,.45)); }
  .brandText { display: grid; gap: 4px; min-width: 0; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 0; font-size: 34px; line-height: 1; }
  .sub, .hint { color: rgba(232,234,237,.74); font-size: 13px; line-height: 1.4; }
  .low { color: rgba(255,150,150,.98); font-weight: 950; }
  .topActions, .actions, .rowActions, .panelTop { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
  .topActions, .rowActions, .actions { justify-content: flex-end; }
  .btn, .x { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #e8eaed; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 900; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .ghost, .x { background: rgba(0,0,0,.24); }
  .x { color: rgba(255,255,255,.82); }
  .controls { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: center; }
  .search, .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #e8eaed; border-radius: 10px; padding: 11px 12px; outline: none; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; }
  .chip, .tag { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); color: #e8eaed; border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; text-transform: capitalize; }
  .chip { cursor: pointer; }
  .chip.on { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.28); }
  .chip.warn, .lowtag, .lowBorder { border-color: rgba(255,90,90,.38); }
  .inventoryList { display: grid; gap: 10px; margin-top: 12px; }
  .itemRow { display: flex; justify-content: space-between; gap: 14px; border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.055); border-radius: 8px; padding: 13px; }
  .itemMain { display: grid; gap: 7px; min-width: 0; }
  .itemNameLine { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .itemNameLine strong { font-size: 16px; }
  .tag.consumable { border-color: rgba(140,220,255,.24); }
  .tag.part { border-color: rgba(190,255,170,.24); }
  .itemMeta { display: flex; gap: 12px; flex-wrap: wrap; color: rgba(232,234,237,.72); font-size: 13px; }
  .empty { display: grid; gap: 4px; padding: 16px 4px; color: rgba(232,234,237,.86); }
  .empty span { color: rgba(232,234,237,.62); font-size: 13px; }
  .title { font-size: 18px; font-weight: 1000; }
  .formGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .full { grid-column: 1 / -1; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .weighBox { display: grid; gap: 8px; align-content: end; }
  .saved { align-self: center; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; }
  .modalShade { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.64); display: grid; place-items: center; padding: 18px; }
  .modal { width: min(440px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .modalBrand { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; font-weight: 950; }
  .modalText { font-size: 24px; line-height: 1.1; font-weight: 1000; }
  .modalActions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 980px) { .workspace { grid-template-columns: 1fr; } .listPanel { min-height: auto; } .editorPanel { position: static; max-height: none; } }
  @media (max-width: 820px) { .wrap { padding: 14px; } .head, .itemRow, .panelTop { display: grid; } .controls, .formGrid { grid-template-columns: 1fr; } .topActions, .rowActions, .actions, .filters { justify-content: stretch; } .btn, .x { flex: 1 1 auto; } }
`;
