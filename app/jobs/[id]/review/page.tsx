"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { photoFileToStorageDataUrl, stripOversizedPhotoDataUrl } from "@/lib/imageStorage";
import { KEYS, loadJSON, saveJSON } from "@/lib/marStorage";
import { DEFAULT_LABOR_BILLING, normalizeServiceCounters, uid, type LaborBillingSettings, type MaterialBillingMode, type Settings } from "@/lib/setupData";

type CounterId = string;
type Equipment = "p100" | "p95ov_weldsand" | "p95ov_spray" | "supplied_air" | "booth" | "devilbiss";
type UsedItem = {
  itemId: string;
  qty: number;
  billingMode?: MaterialBillingMode;
  billingPercent?: number;
  countAsExpense?: boolean;
};
type ExtraExpense = { id: string; name: string; amount: number };
type Photo = { id?: string; name: string; dataUrl: string; caption?: string; createdAt?: string };
type PhotoSheetItem = { id: string; sourceId?: string; name: string; dataUrl: string; caption: string; createdAt: string };
type PhotoSheet = { title: string; notes: string; photos: PhotoSheetItem[]; updatedAt: string };

type Session = {
  id: string;
  jobId: string;
  jobName?: string;
  startedAt?: string;
  startISO?: string;
  endedAt?: string | null;
  endISO?: string | null;
  elapsedSec?: number;
  totalPausedMs?: number;
  equipment?: Equipment[] | Record<string, unknown>;
  counters?: Record<CounterId, boolean>;
  counterElapsedMs?: Record<CounterId, number>;
  usedItems?: UsedItem[];
  extraExpenses?: ExtraExpense[];
  materialTotal?: number;
  billingSummary?: {
    billableHours: number;
    laborTotal: number;
    materialTotal: number;
    materialRevenue: number;
    expenseTotal: number;
    extraExpenseTotal: number;
    materialMarkupTotal: number;
    taxTotal: number;
    moneyMade: number;
  };
  reviewedAt?: string;
  active?: boolean;
  photos?: Photo[];
  photoSheet?: PhotoSheet;
};

type Job = {
  id: string;
  name?: string;
  title?: string;
  status?: "active" | "done";
  completedAt?: string;
  invoiceReady?: boolean;
  billingEstimate?: {
    grossPay: number;
    totalExpenses: number;
    netPay: number;
    laborTotal: number;
    materialRevenue: number;
    materialCost: number;
    extraExpenses: number;
    taxTotal: number;
    updatedAt: string;
  };
};

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  minThreshold?: number;
};

type Runtime = {
  sprayHours?: number;
  boothHours?: number;
  suppliedAirHours?: number;
  weldSandHours?: number;
  devilbissHours?: number;
  customCounterHours?: Record<string, number>;
};

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && key && Array.isArray((raw as Record<string, unknown>)[key])) return (raw as Record<string, T[]>)[key];
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).items)) return (raw as Record<string, T[]>).items;
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).sessions)) return (raw as Record<string, T[]>).sessions;
  return [];
}

function equipmentArray(value: Session["equipment"]): Equipment[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const out: Equipment[] = [];
  if (value.booth) out.push("booth");
  if (value.devilbiss) out.push("devilbiss");
  if (value.respirator === "p100" || value.respirator === "p95ov_weldsand" || value.respirator === "p95ov_spray" || value.respirator === "supplied_air") out.push(value.respirator);
  return out;
}

function sessionMs(session: Session) {
  if (session.elapsedSec) return Math.max(0, session.elapsedSec * 1000);
  const start = new Date(session.startedAt || session.startISO || new Date().toISOString()).getTime();
  const end = new Date(session.endedAt || session.endISO || new Date().toISOString()).getTime();
  return Math.max(0, end - start - (session.totalPausedMs || 0));
}

function counterMs(session: Session, id: CounterId) {
  const stored = session.counterElapsedMs?.[id];
  if (Number.isFinite(Number(stored))) return Math.max(0, Number(stored));
  const equipment = equipmentArray(session.equipment);
  const counters = session.counters ?? {
    spray_hours: equipment.includes("booth") || equipment.includes("p95ov_spray"),
    supplied_air_hours: equipment.includes("supplied_air"),
    weld_sand_hours: equipment.includes("p100") || equipment.includes("p95ov_weldsand"),
  };
  return counters[id] ? sessionMs(session) : 0;
}

function msToHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function roundedBillableHours(rawHours: number, minimumHours: number, incrementMinutes: number) {
  const base = Math.max(rawHours, minimumHours || 0);
  const incrementHours = incrementMinutes > 0 ? incrementMinutes / 60 : 0;
  if (!incrementHours) return base;
  return Math.ceil(base / incrementHours) * incrementHours;
}

function materialCharge(cost: number, mode: MaterialBillingMode, percent: number) {
  if (mode === "none") return 0;
  if (mode === "percent") return cost * Math.max(0, percent) / 100;
  return cost;
}

function extraExpenseTotal(session: Session) {
  return (session.extraExpenses ?? []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function materialTotalsForSession(session: Session, inventory: InventoryItem[], labor: LaborBillingSettings) {
  const defaultMode = labor.includeMaterials ? labor.materialBillingMode : "none";
  return (session.usedItems ?? []).reduce(
    (totals, used) => {
      const item = inventory.find((inventoryItem) => inventoryItem.id === used.itemId);
      const cost = used.qty * Number(item?.unitPrice ?? 0);
      const mode = used.billingMode ?? defaultMode;
      const percent = used.billingPercent ?? labor.materialBillingPercent;
      const revenueBeforeMarkup = materialCharge(cost, mode, percent);
      return {
        cost: totals.cost + cost,
        chargeBase: totals.chargeBase + revenueBeforeMarkup,
        revenue: totals.revenue + revenueBeforeMarkup * (1 + labor.materialMarkupPercent / 100),
        expense: totals.expense + (used.countAsExpense ?? labor.countMaterialsAsExpense ? cost : 0),
      };
    },
    { cost: 0, chargeBase: 0, revenue: 0, expense: 0 }
  );
}

function jobName(job: Job | undefined, session: Session | undefined) {
  return job?.name || job?.title || session?.jobName || "Job session";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normalizePhotoSheet(raw: unknown, photos: Photo[] = []): PhotoSheet {
  const fallbackPhotos = photos.map((photo, index) => ({
    id: uid(),
    sourceId: photo.id ?? `photo-${index}`,
    name: photo.name || `Photo ${index + 1}`,
    dataUrl: photo.dataUrl,
    caption: photo.caption ?? "",
    createdAt: photo.createdAt ?? "",
  }));
  if (!isRecord(raw)) {
    return { title: "Session Photos", notes: "", photos: fallbackPhotos, updatedAt: "" };
  }
  return {
    title: String(raw.title ?? "Session Photos"),
    notes: String(raw.notes ?? ""),
    photos: Array.isArray(raw.photos)
      ? raw.photos.filter(isRecord).map((photo) => ({
        id: String(photo.id ?? uid()),
        sourceId: typeof photo.sourceId === "string" ? photo.sourceId : undefined,
        name: String(photo.name ?? "Photo"),
        dataUrl: String(photo.dataUrl ?? ""),
        caption: String(photo.caption ?? ""),
        createdAt: String(photo.createdAt ?? ""),
      })).filter((photo) => photo.dataUrl)
      : fallbackPhotos,
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

function sessionPhotosFromSheet(existingPhotos: Photo[] = [], sheet: PhotoSheet): Photo[] {
  const sheetBySource = new Map(sheet.photos.filter((photo) => photo.sourceId).map((photo) => [photo.sourceId, photo]));
  const sheetByData = new Map(sheet.photos.filter((photo) => photo.dataUrl).map((photo) => [photo.dataUrl, photo]));

  const normalizedExisting = existingPhotos
    .map((photo, index) => {
      const id = photo.id ?? `photo-${index}`;
      const sheetPhoto = sheetBySource.get(id) ?? sheetByData.get(photo.dataUrl);
      return {
        ...photo,
        id,
        name: photo.name || sheetPhoto?.name || `Photo ${index + 1}`,
        dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl),
        caption: sheetPhoto?.caption ?? photo.caption ?? "",
        createdAt: photo.createdAt ?? sheetPhoto?.createdAt ?? "",
      };
    })
    .filter((photo) => photo.dataUrl);

  const usedIds = new Set(normalizedExisting.map((photo) => photo.id).filter(Boolean));
  const usedDataUrls = new Set(normalizedExisting.map((photo) => photo.dataUrl).filter(Boolean));
  const additions = sheet.photos
    .map((photo) => ({
      id: photo.sourceId ?? photo.id,
      name: photo.name,
      dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl),
      caption: photo.caption,
      createdAt: photo.createdAt,
    }))
    .filter((photo) => photo.dataUrl && !usedIds.has(photo.id) && !usedDataUrls.has(photo.dataUrl));

  return [...normalizedExisting, ...additions];
}

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [runtime, setRuntime] = useState<Runtime>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [materialBilling, setMaterialBilling] = useState<Record<string, { mode: MaterialBillingMode; percent: number; countAsExpense: boolean }>>({});
  const [extraExpenses, setExtraExpenses] = useState<ExtraExpense[]>([]);
  const [photoSheet, setPhotoSheet] = useState<PhotoSheet>({ title: "Session Photos", notes: "", photos: [], updatedAt: "" });
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loadedSessions = asList<Session>(loadJSON<unknown>(KEYS.sessions, []), "sessions");
      const loadedJobs = asList<Job>(loadJSON<unknown>(KEYS.jobs, []), "jobs");
      const loadedInventory = asList<InventoryItem>(loadJSON<unknown>(KEYS.inventory, { items: [] }), "items");
      const current = loadedSessions.find((session) => session.id === sessionId);
      setSessions(loadedSessions);
      setJobs(loadedJobs);
      setInventory(loadedInventory);
      setRuntime(loadJSON<Runtime>(KEYS.runtime, {}));
      setSettings(loadJSON<Settings | null>(KEYS.settings, null));
      setUsed(Object.fromEntries((current?.usedItems || []).map((item) => [item.itemId, item.qty])));
      setMaterialBilling(Object.fromEntries((current?.usedItems || []).map((item) => [
        item.itemId,
        {
          mode: item.billingMode ?? DEFAULT_LABOR_BILLING.materialBillingMode,
          percent: item.billingPercent ?? DEFAULT_LABOR_BILLING.materialBillingPercent,
          countAsExpense: item.countAsExpense ?? DEFAULT_LABOR_BILLING.countMaterialsAsExpense,
        },
      ])));
      setExtraExpenses(current?.extraExpenses ?? []);
      setPhotoSheet(normalizePhotoSheet(current?.photoSheet, current?.photos ?? []));
    }, 0);
    return () => window.clearTimeout(id);
  }, [sessionId]);

  const session = useMemo(() => sessions.find((item) => item.id === sessionId), [sessions, sessionId]);
  const job = useMemo(() => jobs.find((item) => item.id === session?.jobId), [jobs, session?.jobId]);
  const equipment = equipmentArray(session?.equipment);
  const totalMs = useMemo(() => sessions.filter((item) => item.jobId === session?.jobId).reduce((sum, item) => sum + sessionMs(item), 0), [sessions, session?.jobId]);
  const sessionTime = session ? sessionMs(session) : 0;
  const serviceCounters = useMemo(() => normalizeServiceCounters(settings?.serviceCounters), [settings?.serviceCounters]);
  const counters = useMemo(() =>
    Object.fromEntries(serviceCounters.map((counter) => [counter.id, session ? counterMs(session, counter.id) : 0])),
  [serviceCounters, session]);

  const usedRows = useMemo(() => {
    return inventory
      .map((item) => ({ item, qty: Number(used[item.id] ?? 0) }))
      .filter((row) => row.qty > 0);
  }, [inventory, used]);

  const labor = useMemo(() => ({ ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) }), [settings?.billing?.labor]);
  const defaultMaterialMode = labor.includeMaterials ? labor.materialBillingMode : "none";
  const currentSessionMaterial = usedRows.reduce(
    (totals, row) => {
      const cost = row.qty * Number(row.item.unitPrice ?? 0);
      const billing = materialBilling[row.item.id];
      const mode = billing?.mode ?? defaultMaterialMode;
      const percent = billing?.percent ?? labor.materialBillingPercent;
      const countAsExpense = billing?.countAsExpense ?? labor.countMaterialsAsExpense;
      const revenueBeforeMarkup = materialCharge(cost, mode, percent);
      return {
        cost: totals.cost + cost,
        chargeBase: totals.chargeBase + revenueBeforeMarkup,
        revenue: totals.revenue + revenueBeforeMarkup * (1 + labor.materialMarkupPercent / 100),
        expense: totals.expense + (countAsExpense ? cost : 0),
      };
    },
    { cost: 0, chargeBase: 0, revenue: 0, expense: 0 }
  );
  const materialTotal = currentSessionMaterial.cost;
  const extraTotal = extraExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const sessionExpenseTotal = currentSessionMaterial.expense + extraTotal;
  const billableHours = labor.enabled
    ? roundedBillableHours(sessionTime / 3600000, labor.minimumHours, labor.billingIncrementMinutes)
    : 0;
  const laborTotal = labor.enabled ? billableHours * labor.hourlyRate : 0;
  const materialMarkupTotal = Math.max(0, currentSessionMaterial.revenue - currentSessionMaterial.chargeBase);
  const taxableSubtotal = laborTotal + currentSessionMaterial.revenue;
  const taxTotal = taxableSubtotal * (labor.taxPercent / 100);
  const moneyMade = taxableSubtotal + taxTotal;
  const jobMaterialExpense = sessions
    .filter((item) => item.jobId === session?.jobId)
    .reduce((sum, item) => {
      if (item.id === session?.id) return sum + sessionExpenseTotal;
      const totals = materialTotalsForSession(item, inventory, labor);
      return sum + totals.expense + extraExpenseTotal(item);
    }, 0);
  const jobMaterialRevenue = sessions
    .filter((item) => item.jobId === session?.jobId)
    .reduce((sum, item) => {
      if (item.id === session?.id) return sum + currentSessionMaterial.revenue;
      return sum + materialTotalsForSession(item, inventory, labor).revenue;
    }, 0);
  const jobRawMaterialCost = sessions
    .filter((item) => item.jobId === session?.jobId)
    .reduce((sum, item) => {
      if (item.id === session?.id) return sum + materialTotal;
      return sum + materialTotalsForSession(item, inventory, labor).cost;
    }, 0);
  const jobExtraExpenseTotal = sessions
    .filter((item) => item.jobId === session?.jobId)
    .reduce((sum, item) => sum + (item.id === session?.id ? extraTotal : extraExpenseTotal(item)), 0);
  const billableJobHours = labor.enabled
    ? roundedBillableHours(totalMs / 3600000, labor.minimumHours, labor.billingIncrementMinutes)
    : 0;
  const jobLaborTotal = labor.enabled ? billableJobHours * labor.hourlyRate : 0;
  const jobTaxableSubtotal = jobLaborTotal + jobMaterialRevenue;
  const jobTaxTotal = jobTaxableSubtotal * (labor.taxPercent / 100);
  const grossPay = jobTaxableSubtotal + jobTaxTotal;
  const netPay = grossPay - jobMaterialExpense;

  if (!session) {
    return (
      <main className="wrap">
        <ApplyWallpaper />
        <section className="panel">
          <div className="panelTitle">Session not found.</div>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </section>
        <Style />
      </main>
    );
  }

  const finalUsedItems = () =>
    Object.entries(used)
      .map(([itemId, qty]) => {
        const billing = materialBilling[itemId];
        return {
          itemId,
          qty: Number(qty) || 0,
          billingMode: billing?.mode ?? defaultMaterialMode,
          billingPercent: billing?.percent ?? labor.materialBillingPercent,
          countAsExpense: billing?.countAsExpense ?? labor.countMaterialsAsExpense,
        };
      })
      .filter((item) => item.qty > 0);

  const updateMaterialBilling = (itemId: string, patch: Partial<{ mode: MaterialBillingMode; percent: number; countAsExpense: boolean }>) => {
    setMaterialBilling((current) => ({
      ...current,
      [itemId]: {
        mode: current[itemId]?.mode ?? defaultMaterialMode,
        percent: current[itemId]?.percent ?? labor.materialBillingPercent,
        countAsExpense: current[itemId]?.countAsExpense ?? labor.countMaterialsAsExpense,
        ...patch,
      },
    }));
  };

  const addExtraExpense = () => {
    setExtraExpenses((current) => [...current, { id: uid(), name: "", amount: 0 }]);
  };

  const updateExtraExpense = (id: string, patch: Partial<ExtraExpense>) => {
    setExtraExpenses((current) => current.map((expense) => (expense.id === id ? { ...expense, ...patch } : expense)));
  };

  const removeExtraExpense = (id: string) => {
    setExtraExpenses((current) => current.filter((expense) => expense.id !== id));
  };

  const updatePhotoSheet = (patch: Partial<PhotoSheet>) => {
    setPhotoSheet((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  };

  const updateSheetPhoto = (id: string, patch: Partial<PhotoSheetItem>) => {
    setPhotoSheet((current) => ({
      ...current,
      photos: current.photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeSheetPhoto = (id: string) => {
    setPhotoSheet((current) => ({ ...current, photos: current.photos.filter((photo) => photo.id !== id), updatedAt: new Date().toISOString() }));
  };

  const moveSheetPhoto = (id: string, direction: -1 | 1) => {
    setPhotoSheet((current) => {
      const index = current.photos.findIndex((photo) => photo.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.photos.length) return current;
      const photos = [...current.photos];
      [photos[index], photos[nextIndex]] = [photos[nextIndex], photos[index]];
      return { ...current, photos, updatedAt: new Date().toISOString() };
    });
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const photos = await Promise.all(Array.from(files).slice(0, 6).map(async (file) => ({
      id: uid(),
      name: file.name,
      dataUrl: await photoFileToStorageDataUrl(file),
      caption: "",
      createdAt: new Date().toISOString(),
    }))).then((items) => items.filter((photo) => photo.dataUrl));
    setPhotoSheet((current) => ({ ...current, photos: [...current.photos, ...photos], updatedAt: new Date().toISOString() }));
  };

  const saveConclusion = (finishJob: boolean) => {
    const usedItems = finalUsedItems();
    const now = new Date().toISOString();

    const nextInventory = inventory.map((item) => {
      const usedQty = usedItems.find((usedItem) => usedItem.itemId === item.id)?.qty ?? 0;
      return usedQty > 0 ? { ...item, quantity: Math.max(0, Number(item.quantity || 0) - usedQty) } : item;
    });

    const nextRuntime: Runtime = {
      ...runtime,
      sprayHours: (runtime.sprayHours || 0) + counters.spray_hours / 3600000,
      suppliedAirHours: (runtime.suppliedAirHours || 0) + counters.supplied_air_hours / 3600000,
      weldSandHours: (runtime.weldSandHours || 0) + counters.weld_sand_hours / 3600000,
      customCounterHours: {
        ...(runtime.customCounterHours ?? {}),
        ...Object.fromEntries(serviceCounters
          .filter((counter) => !["spray_hours", "supplied_air_hours", "weld_sand_hours"].includes(counter.id))
          .map((counter) => [counter.id, Number(runtime.customCounterHours?.[counter.id] ?? 0) + Number(counters[counter.id] ?? 0) / 3600000])),
      },
      boothHours: (runtime.boothHours || 0) + (equipment.includes("booth") ? sessionTime / 3600000 : 0),
      devilbissHours: (runtime.devilbissHours || 0) + (equipment.includes("devilbiss") ? sessionTime / 3600000 : 0),
    };

    const nextSessions = sessions.map((item) =>
      item.id === session.id
        ? {
            ...item,
            usedItems,
            extraExpenses: extraExpenses
              .map((expense) => ({ ...expense, name: expense.name.trim() || "Unmarked expense", amount: Number(expense.amount || 0) }))
              .filter((expense) => expense.amount > 0),
            photos: sessionPhotosFromSheet(item.photos ?? [], photoSheet),
            photoSheet: {
              ...photoSheet,
              photos: photoSheet.photos.map((photo) => ({ ...photo, dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl) })).filter((photo) => photo.dataUrl || photo.sourceId),
              updatedAt: now,
            },
            materialTotal,
            billingSummary: {
              billableHours,
              laborTotal,
              materialTotal,
              materialRevenue: currentSessionMaterial.revenue,
              expenseTotal: sessionExpenseTotal,
              extraExpenseTotal: extraTotal,
              materialMarkupTotal,
              taxTotal,
              moneyMade,
            },
            reviewedAt: now,
            active: false,
            endedAt: item.endedAt ?? now,
            endISO: item.endISO ?? now,
          }
        : item
    );

    const nextJobs = jobs.map((item) =>
      item.id === session.jobId
        ? finishJob
          ? {
              ...item,
              status: "done" as const,
              completedAt: now,
              invoiceReady: true,
              billingEstimate: {
                grossPay,
                totalExpenses: jobMaterialExpense,
                netPay,
                laborTotal: jobLaborTotal,
                materialRevenue: jobMaterialRevenue,
                materialCost: jobRawMaterialCost,
                extraExpenses: jobExtraExpenseTotal,
                taxTotal: jobTaxTotal,
                updatedAt: now,
              },
            }
          : {
              ...item,
              status: "active" as const,
              billingEstimate: {
                grossPay,
                totalExpenses: jobMaterialExpense,
                netPay,
                laborTotal: jobLaborTotal,
                materialRevenue: jobMaterialRevenue,
                materialCost: jobRawMaterialCost,
                extraExpenses: jobExtraExpenseTotal,
                taxTotal: jobTaxTotal,
                updatedAt: now,
              },
            }
        : item
    );

    saveJSON(KEYS.inventory, { items: nextInventory, meta: { savedAt: now } });
    saveJSON(KEYS.runtime, nextRuntime);
    try {
      saveJSON(KEYS.sessions, nextSessions);
    } catch {
      saveJSON(KEYS.sessions, nextSessions.map((storedSession) => ({
        ...storedSession,
        photos: (storedSession.photos ?? [])
          .map((photo) => ({ ...photo, dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl) }))
          .filter((photo) => photo.dataUrl),
        photoSheet: storedSession.photoSheet
          ? {
              ...storedSession.photoSheet,
              photos: storedSession.photoSheet.photos
                .map((photo) => ({ ...photo, dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl) }))
                .filter((photo) => photo.dataUrl || photo.sourceId),
            }
          : storedSession.photoSheet,
      })));
    }
    saveJSON(KEYS.jobs, nextJobs);
    router.push("/dashboard");
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />
      <header className="head">
        <div>
          <div className="micro">SESSION CONCLUSION</div>
          <h1>{jobName(job, session)}</h1>
          <p>Review time, counters, equipment, and materials before closing this session.</p>
        </div>
      </header>

      <section className="summaryGrid">
        <Stat label="Session time" value={msToHMS(sessionTime)} />
        <Stat label="Total job time" value={msToHMS(totalMs)} />
        <Stat label="Gross pay" value={labor.enabled ? money(grossPay) : "N/A"} />
        <Stat label="Total expenses" value={money(jobMaterialExpense)} />
        <Stat label="Net pay" value={labor.enabled ? money(netPay) : "N/A"} />
      </section>

      <section className="grid">
        <div className="panel">
          <div>
            <div className="panelTitle">Materials Used</div>
            <div className="hint">Add anything used that was not noted on the status screen. These quantities subtract from inventory when you save.</div>
          </div>
          <div className="materialList">
            {inventory.map((item) => {
              const qty = Number(used[item.id] ?? 0);
              const after = Math.max(0, Number(item.quantity || 0) - qty);
              const billing = materialBilling[item.id] ?? {
                mode: defaultMaterialMode,
                percent: labor.materialBillingPercent,
                countAsExpense: labor.countMaterialsAsExpense,
              };
              const cost = qty * Number(item.unitPrice ?? 0);
              const charge = materialCharge(cost, billing.mode, billing.percent) * (1 + labor.materialMarkupPercent / 100);
              return (
                <div key={item.id} className="materialRow">
                  <span>
                    <strong>{item.name || "Unnamed item"}</strong>
                    <small>{item.quantity} {item.unit} on hand - {money(Number(item.unitPrice ?? 0))} / {item.unit}</small>
                    {qty > 0 && <small>After save: {after} {item.unit}</small>}
                    {qty > 0 && <small>Customer charge: {money(charge)} / expense: {billing.countAsExpense ? money(cost) : money(0)}</small>}
                  </span>
                  <DecimalInput className="input qty" value={used[item.id] ?? ""} onValueChange={(value) => setUsed((current) => ({ ...current, [item.id]: value }))} />
                  <div className="materialBilling">
                    <label className="label">Customer pays
                      <select className="input" value={billing.mode} onChange={(event) => updateMaterialBilling(item.id, { mode: event.target.value as MaterialBillingMode })}>
                        <option value="none">None</option>
                        <option value="percent">Percentage</option>
                        <option value="all">All</option>
                      </select>
                    </label>
                    {billing.mode === "percent" && (
                      <label className="label">Percent
                        <DecimalInput className="input" value={billing.percent} onValueChange={(value) => updateMaterialBilling(item.id, { percent: value })} />
                      </label>
                    )}
                    <button className={`toggleExpense ${billing.countAsExpense ? "on" : ""}`} onClick={() => updateMaterialBilling(item.id, { countAsExpense: !billing.countAsExpense })}>
                      {billing.countAsExpense ? "Counts as expense" : "Not an expense"}
                    </button>
                  </div>
                </div>
              );
            })}
            {inventory.length === 0 && <div className="empty">No inventory set up yet.</div>}
          </div>
        </div>

        <div className="panel">
          <div>
            <div className="panelTitle">Extra Expenses</div>
            <div className="hint">Use this for unmarked or unforeseen costs that should reduce net pay.</div>
          </div>
          <div className="expenseList">
            {extraExpenses.map((expense) => (
              <div className="expenseRow" key={expense.id}>
                <input className="input" value={expense.name} onChange={(event) => updateExtraExpense(expense.id, { name: event.target.value })} placeholder="Expense name" />
                <DecimalInput className="input qty" value={expense.amount || ""} onValueChange={(value) => updateExtraExpense(expense.id, { amount: value })} placeholder="0" />
                <button className="btn ghost" onClick={() => removeExtraExpense(expense.id)}>Remove</button>
              </div>
            ))}
            {extraExpenses.length === 0 && <div className="empty">No extra expenses added.</div>}
          </div>
          <button className="btn ghost" onClick={addExtraExpense}>Add Expense</button>
          <div className="counter"><span>Total extra expenses</span><strong>{money(extraTotal)}</strong></div>
        </div>

        <div className="panel photoPanel">
          <div className="panelTop">
            <div>
              <div className="panelTitle">Photo Sheet</div>
              <div className="hint">Arrange photos and captions before saving this session review.</div>
            </div>
            <label className="btn ghost">Add Photos<input type="file" accept="image/*" multiple onChange={(event) => addPhotos(event.target.files)} hidden /></label>
          </div>
          <div className="photoList">
            {photoSheet.photos.map((photo, index) => (
              <article className="photoRow" key={photo.id}>
                <img src={photo.dataUrl} alt={photo.caption || photo.name} />
                <div>
                  <div className="photoMeta">Photo {index + 1} - {photo.name}</div>
                  <textarea className="input photoCaption" value={photo.caption} onChange={(event) => updateSheetPhoto(photo.id, { caption: event.target.value })} placeholder="Caption..." />
                  <div className="finishActions">
                    <button className="btn ghost" disabled={index === 0} onClick={() => moveSheetPhoto(photo.id, -1)}>Move Up</button>
                    <button className="btn ghost" disabled={index === photoSheet.photos.length - 1} onClick={() => moveSheetPhoto(photo.id, 1)}>Move Down</button>
                    <button className="btn danger" onClick={() => removeSheetPhoto(photo.id)}>Remove</button>
                  </div>
                </div>
              </article>
            ))}
            {photoSheet.photos.length === 0 && <div className="empty">No photos added yet.</div>}
          </div>
        </div>

        <div className="panel">
          <div>
            <div className="panelTitle">Counters And Equipment</div>
            <div className="hint">These are the times that will be added to service/runtime tracking.</div>
          </div>
          {serviceCounters.map((counter) => <Counter key={counter.id} label={counter.name} ms={Number(counters[counter.id] ?? 0)} />)}
          <Counter label="Booth in use" ms={equipment.includes("booth") ? sessionTime : 0} />
          <Counter label="Air system in use" ms={equipment.includes("devilbiss") ? sessionTime : 0} />

          <div className="equipmentList">
            {equipment.length ? equipment.map((item) => <span key={item}>{equipmentLabel(item)}</span>) : <span>No equipment logged</span>}
          </div>
        </div>
      </section>

      <section className="panel finishPanel">
        <div>
          <div className="panelTitle">Ending Options</div>
          <div className="hint">Choose whether this job stays active or becomes invoice-ready.</div>
        </div>
        <div className="finishActions">
          <button className="btn primary" onClick={() => saveConclusion(false)}>Save And Keep Active</button>
          <button className="btn danger" onClick={() => setConfirmEnd(true)}>Save And End Job</button>
        </div>
      </section>

      {confirmEnd && (
        <div className="modalShade">
          <div className="modal">
            <div className="panelTitle">End this job?</div>
            <p>This will mark the job inactive and invoice-ready. It cannot be restarted from the active job flow.</p>
            <div className="finishActions">
              <button className="btn ghost" onClick={() => setConfirmEnd(false)}>Cancel</button>
              <button className="btn danger" onClick={() => saveConclusion(true)}>Yes, End Job</button>
            </div>
          </div>
        </div>
      )}

      <Style />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Counter({ label, ms }: { label: string; ms: number }) {
  return <div className="counter"><span>{label}</span><strong>{msToHMS(ms)}</strong></div>;
}

function equipmentLabel(value: Equipment) {
  if (value === "p95ov_weldsand") return "P95 + OV Weld/Sand";
  if (value === "p95ov_spray") return "P95 + OV Spray";
  if (value === "supplied_air") return "Supplied Air";
  if (value === "devilbiss") return "Devilbiss Air";
  if (value === "booth") return "Spray Booth";
  return "P100";
}

function Style() {
  return (
    <style jsx global>{`
      .wrap { min-height: 100vh; padding: 22px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
      .head, .grid, .summaryGrid, .finishPanel { width: min(1160px, 100%); margin: 0 auto; }
      .head { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; backdrop-filter: blur(8px); }
      .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
      h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
      p, .hint { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
      .summaryGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
      .stat { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.38); border-radius: 12px; padding: 14px; display: grid; gap: 8px; }
      .stat span { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; opacity: .65; font-weight: 950; }
      .stat strong { font-size: 22px; }
      .grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(340px, .85fr); gap: 12px; align-items: stretch; }
      .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 16px; display: grid; gap: 12px; align-content: start; backdrop-filter: blur(8px); min-height: 100%; }
      .panelTop { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
      .panelTitle { font-size: 18px; font-weight: 1000; }
      .materialList { display: grid; gap: 8px; max-height: 56vh; overflow: auto; padding-right: 4px; }
      .materialRow { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.045); border-radius: 10px; padding: 10px; }
      .materialRow span { display: grid; gap: 4px; min-width: 0; }
      .materialRow small { color: rgba(238,241,243,.68); }
      .materialBilling { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0,1fr) minmax(120px,.45fr) auto; gap: 8px; align-items: end; }
      .toggleExpense { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; }
      .toggleExpense.on { background: rgba(140,220,255,.12); border-color: rgba(140,220,255,.3); }
      .expenseList { display: grid; gap: 8px; }
      .expenseRow { display: grid; grid-template-columns: minmax(0,1fr) 110px auto; gap: 8px; align-items: center; }
      .photoPanel { min-height: 260px; }
      .photoPanel .btn { flex: 0 0 auto; }
      .photoList { display: grid; gap: 10px; }
      .photoRow { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 10px; display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 10px; align-items: start; }
      .photoRow img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.22); }
      .photoMeta { color: rgba(238,241,243,.68); font-size: 12px; font-weight: 850; margin-bottom: 7px; }
      .photoCaption { min-height: 76px; resize: vertical; margin-bottom: 8px; }
      .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 10px 12px; outline: none; }
      .qty { text-align: right; font-weight: 950; }
      .counter { display: flex; justify-content: space-between; gap: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 10px; padding: 11px 12px; }
      .equipmentList { display: flex; flex-wrap: wrap; gap: 8px; }
      .equipmentList span { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 999px; padding: 7px 9px; font-size: 12px; font-weight: 900; }
      .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 11px 13px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; justify-content: center; align-items: center; }
      .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
      .ghost { background: rgba(255,255,255,.05); }
      .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
      .finishPanel { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .finishActions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .empty { color: rgba(238,241,243,.72); font-size: 13px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.035); border-radius: 10px; padding: 12px; }
      .modalShade { position: fixed; inset: 0; background: rgba(0,0,0,.62); display: grid; place-items: center; padding: 18px; z-index: 20; }
      .modal { width: min(460px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
      @media (max-width: 900px) { .wrap { padding: 14px; } .head, .grid, .finishPanel, .photoRow, .panelTop { display: grid; grid-template-columns: 1fr; } .summaryGrid { grid-template-columns: 1fr 1fr; } .materialList { max-height: none; } .finishActions { justify-content: stretch; } .btn, .photoPanel .btn { flex: 1 1 auto; } }
      @media (max-width: 560px) { .summaryGrid, .materialRow, .materialBilling, .expenseRow { grid-template-columns: 1fr; } }
    `}</style>
  );
}
