"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { photoFileToStorageDataUrl, stripOversizedPhotoDataUrl } from "@/lib/imageStorage";
import { DEFAULT_LABOR_BILLING, normalizeServiceCounters, type LaborBillingSettings, type MaterialBillingMode, type Settings } from "@/lib/setupData";

const SETTINGS_KEY = "marshall_settings_v1";
const JOBS_KEY = "marshall_jobs_v1";
const INVENTORY_KEY = "marshall_inventory_v1";
const NOTICES_KEY = "marshall_notices_v1";
const NOTIFICATIONS_KEY = "marshall_notifications_v1";
const SESSIONS_KEY = "marshall_sessions_v1";

type CounterId = string;
type EquipmentId = "p100" | "p95ov_weldsand" | "p95ov_spray" | "supplied_air" | "booth" | "devilbiss";
type NoticeLevel = "info" | "warn" | "danger";

type Job = {
  id: string;
  name: string;
  title?: string;
  type?: string;
  customer?: string;
  customerName?: string;
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string };
  vin?: string;
  stage?: string;
};

type InventoryItem = {
  id: string;
  name: string;
  category: "consumable" | "part";
  unit: string;
  unitPrice: number;
  quantity: number;
  minThreshold: number;
};

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

type SessionRecord = {
  id: string;
  jobId: string;
  jobName?: string;
  startedAt: string;
  startISO?: string;
  endedAt?: string | null;
  endISO?: string | null;
  pausedAt?: string | null;
  totalPausedMs: number;
  active?: boolean;
  stage?: string;
  task?: string;
  equipment: EquipmentId[];
  counters: Record<CounterId, boolean>;
  counterElapsedMs: Record<CounterId, number>;
  counterStartedAt: Partial<Record<CounterId, string>>;
  usedItems: UsedItem[];
  extraExpenses: ExtraExpense[];
  notes: string;
  photos: Photo[];
  photoSheet?: PhotoSheet;
  images?: { id: string; name: string; dataUrl: string; createdISO: string }[];
};

type Notice = {
  id: string;
  title: string;
  body?: string;
  level: NoticeLevel;
  hidden?: boolean;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function asList(raw: unknown, key?: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key];
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items;
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions;
  return [];
}

function normalizeJobs(raw: unknown): Job[] {
  return asList(raw, "jobs").filter(isRecord).map((job) => ({
    id: String(job.id ?? uid()),
    name: String(job.name ?? job.title ?? "Untitled job"),
    title: typeof job.title === "string" ? job.title : undefined,
    type: typeof job.type === "string" ? job.type : undefined,
    customer: typeof job.customer === "string" ? job.customer : undefined,
    customerName: typeof job.customerName === "string" ? job.customerName : typeof job.customer === "string" ? job.customer : undefined,
    vehicle: typeof job.vehicle === "string" || isRecord(job.vehicle) ? (job.vehicle as Job["vehicle"]) : undefined,
    vin: typeof job.vin === "string" ? job.vin : undefined,
    stage: typeof job.stage === "string" ? job.stage : undefined,
  }));
}

function normalizeInventory(raw: unknown): InventoryItem[] {
  return asList(raw, "items").filter(isRecord).map((item) => ({
    id: String(item.id ?? uid()),
    name: String(item.name ?? ""),
    category: item.category === "part" ? "part" : "consumable",
    unit: String(item.unit ?? "count"),
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
    minThreshold: Number.isFinite(Number(item.minThreshold)) ? Number(item.minThreshold) : 0,
  }));
}

function equipmentArray(value: unknown): EquipmentId[] {
  if (Array.isArray(value)) return value.filter(isEquipment);
  if (!isRecord(value)) return [];
  const out: EquipmentId[] = [];
  if (value.booth) out.push("booth");
  if (value.devilbiss) out.push("devilbiss");
  if (value.respirator && isEquipment(value.respirator)) out.push(value.respirator);
  return out;
}

function isEquipment(value: unknown): value is EquipmentId {
  return value === "p100" || value === "p95ov_weldsand" || value === "p95ov_spray" || value === "supplied_air" || value === "booth" || value === "devilbiss";
}

function isMaterialBillingMode(value: unknown): value is MaterialBillingMode {
  return value === "none" || value === "percent" || value === "all";
}

function normalizeCounters(raw: unknown, equipment: EquipmentId[]): Record<CounterId, boolean> {
  const source = isRecord(raw) ? raw : {};
  return {
    ...Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Boolean(value)])),
    spray_hours: Boolean(source.spray_hours ?? (equipment.includes("booth") || equipment.includes("p95ov_spray"))),
    supplied_air_hours: Boolean(source.supplied_air_hours ?? equipment.includes("supplied_air")),
    weld_sand_hours: Boolean(source.weld_sand_hours ?? (equipment.includes("p100") || equipment.includes("p95ov_weldsand"))),
  };
}

function normalizeCounterElapsed(raw: unknown): Record<CounterId, number> {
  const source = isRecord(raw) ? raw : {};
  return {
    ...Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : 0])),
    spray_hours: Number.isFinite(Number(source.spray_hours)) ? Number(source.spray_hours) : 0,
    supplied_air_hours: Number.isFinite(Number(source.supplied_air_hours)) ? Number(source.supplied_air_hours) : 0,
    weld_sand_hours: Number.isFinite(Number(source.weld_sand_hours)) ? Number(source.weld_sand_hours) : 0,
  };
}

function normalizeCounterStarted(raw: unknown): Partial<Record<CounterId, string>> {
  const source = isRecord(raw) ? raw : {};
  return {
    ...Object.fromEntries(Object.entries(source).filter(([, value]) => typeof value === "string")) as Partial<Record<CounterId, string>>,
    spray_hours: typeof source.spray_hours === "string" ? source.spray_hours : undefined,
    supplied_air_hours: typeof source.supplied_air_hours === "string" ? source.supplied_air_hours : undefined,
    weld_sand_hours: typeof source.weld_sand_hours === "string" ? source.weld_sand_hours : undefined,
  };
}

function normalizeSession(raw: unknown): SessionRecord {
  const source = isRecord(raw) ? raw : {};
  const equipment = equipmentArray(source.equipment);
  const usedItems = Array.isArray(source.usedItems)
    ? source.usedItems.filter(isRecord).map((item) => ({
      itemId: String(item.itemId ?? ""),
      qty: Number(item.qty ?? 0),
      billingMode: isMaterialBillingMode(item.billingMode) ? item.billingMode : undefined,
      billingPercent: Number.isFinite(Number(item.billingPercent)) ? Number(item.billingPercent) : undefined,
      countAsExpense: typeof item.countAsExpense === "boolean" ? item.countAsExpense : undefined,
    })).filter((item) => item.itemId)
    : [];
  const extraExpenses = Array.isArray(source.extraExpenses)
    ? source.extraExpenses.filter(isRecord).map((expense) => ({
      id: String(expense.id ?? uid()),
      name: String(expense.name ?? "Unmarked expense"),
      amount: Number.isFinite(Number(expense.amount)) ? Number(expense.amount) : 0,
    })).filter((expense) => expense.amount > 0)
    : [];
  const photos = Array.isArray(source.photos)
    ? source.photos.filter(isRecord).map((photo, index) => ({
      id: typeof photo.id === "string" ? photo.id : `photo-${index}`,
      name: String(photo.name ?? "Photo"),
      dataUrl: String(photo.dataUrl ?? ""),
      caption: typeof photo.caption === "string" ? photo.caption : "",
      createdAt: typeof photo.createdAt === "string" ? photo.createdAt : "",
    })).filter((photo) => photo.dataUrl)
    : [];
  const photoSheet = normalizePhotoSheet(source.photoSheet, photos);
  const counters = normalizeCounters(source.counters, equipment);
  const counterElapsedMs = normalizeCounterElapsed(source.counterElapsedMs);
  const storedStarts = normalizeCounterStarted(source.counterStartedAt);
  const counterStartedAt: Partial<Record<CounterId, string>> = {
    spray_hours: storedStarts.spray_hours ?? (counters.spray_hours && !source.endedAt ? String(source.startedAt ?? source.startISO ?? new Date().toISOString()) : undefined),
    supplied_air_hours: storedStarts.supplied_air_hours ?? (counters.supplied_air_hours && !source.endedAt ? String(source.startedAt ?? source.startISO ?? new Date().toISOString()) : undefined),
    weld_sand_hours: storedStarts.weld_sand_hours ?? (counters.weld_sand_hours && !source.endedAt ? String(source.startedAt ?? source.startISO ?? new Date().toISOString()) : undefined),
  };

  return {
    id: String(source.id ?? uid()),
    jobId: String(source.jobId ?? ""),
    jobName: typeof source.jobName === "string" ? source.jobName : undefined,
    startedAt: String(source.startedAt ?? source.startISO ?? new Date().toISOString()),
    startISO: typeof source.startISO === "string" ? source.startISO : undefined,
    endedAt: typeof source.endedAt === "string" ? source.endedAt : source.endedAt === null ? null : undefined,
    endISO: typeof source.endISO === "string" ? source.endISO : undefined,
    pausedAt: typeof source.pausedAt === "string" ? source.pausedAt : null,
    totalPausedMs: Number.isFinite(Number(source.totalPausedMs)) ? Number(source.totalPausedMs) : 0,
    active: source.active === false ? false : true,
    stage: typeof source.stage === "string" ? source.stage : typeof source.task === "string" ? source.task : undefined,
    task: typeof source.task === "string" ? source.task : typeof source.stage === "string" ? source.stage : undefined,
    equipment,
    counters,
    counterElapsedMs,
    counterStartedAt,
    usedItems,
    extraExpenses,
    notes: String(source.notes ?? ""),
    photos,
    photoSheet,
  };
}

function normalizeSessions(raw: unknown): SessionRecord[] {
  return asList(raw, "sessions").map(normalizeSession);
}

function normalizeNotices(raw: unknown): Notice[] {
  return asList(raw, "items").filter(isRecord).map((notice) => {
    const severity = notice.level ?? notice.severity;
    return {
      id: String(notice.id ?? uid()),
      title: String(notice.title ?? "Alert"),
      body: typeof notice.body === "string" ? notice.body : typeof notice.detail === "string" ? notice.detail : undefined,
      level: severity === "danger" ? "danger" : severity === "warn" ? "warn" : "info",
      hidden: Boolean(notice.hidden),
    };
  });
}

function elapsedMs(session: SessionRecord, now: Date) {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
  if (session.pausedAt) return Math.max(0, new Date(session.pausedAt).getTime() - start - session.totalPausedMs);
  return Math.max(0, end - start - session.totalPausedMs);
}

function counterMs(session: SessionRecord, id: CounterId, now: Date) {
  const stored = Number(session.counterElapsedMs?.[id] ?? 0);
  const startedAt = session.counterStartedAt?.[id];
  if (!session.counters[id] || !startedAt || session.pausedAt || session.endedAt) return stored;
  return stored + Math.max(0, now.getTime() - new Date(startedAt).getTime());
}

function settleCounters(session: SessionRecord, now = new Date()) {
  const ids = new Set([...Object.keys(session.counters), ...Object.keys(session.counterElapsedMs)]);
  return Object.fromEntries([...ids].map((id) => [id, counterMs(session, id, now)]));
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

function materialTotalsForSession(session: SessionRecord, inventory: InventoryItem[], labor: LaborBillingSettings) {
  const defaultMode = labor.includeMaterials ? labor.materialBillingMode : "none";
  return session.usedItems.reduce(
    (totals, used) => {
      const item = inventory.find((inventoryItem) => inventoryItem.id === used.itemId);
      const cost = used.qty * Number(item?.unitPrice ?? 0);
      const mode = used.billingMode ?? defaultMode;
      const percent = used.billingPercent ?? labor.materialBillingPercent;
      const revenueBeforeMarkup = materialCharge(cost, mode, percent);
      return {
        cost: totals.cost + cost,
        revenue: totals.revenue + revenueBeforeMarkup * (1 + labor.materialMarkupPercent / 100),
        expense: totals.expense + (used.countAsExpense ?? labor.countMaterialsAsExpense ? cost : 0),
      };
    },
    { cost: 0, revenue: 0, expense: 0 }
  );
}

function extraExpenseTotal(session: SessionRecord) {
  return session.extraExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function vehicleLabel(job: Job | null) {
  if (!job?.vehicle) return "";
  if (typeof job.vehicle === "string") return job.vehicle;
  return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
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

function upsertPhotoSheetPhotos(sheet: PhotoSheet | undefined, photos: Photo[]): PhotoSheet {
  const current = sheet ?? { title: "Session Photos", notes: "", photos: [], updatedAt: "" };
  const sourceIds = new Set(current.photos.map((photo) => photo.sourceId).filter(Boolean));
  const additions = photos
    .map((photo, index) => ({
      id: uid(),
      sourceId: photo.id ?? `photo-${index}`,
      name: photo.name || `Photo ${index + 1}`,
      dataUrl: photo.dataUrl,
      caption: photo.caption ?? "",
      createdAt: photo.createdAt ?? "",
    }))
    .filter((photo) => photo.dataUrl && !sourceIds.has(photo.sourceId));
  return { ...current, photos: [...current.photos, ...additions], updatedAt: new Date().toISOString() };
}

const soundMap: Record<string, string> = {
  s1: "/sounds/ping1.mp3",
  s2: "/sounds/click1.mp3",
  s3: "/sounds/chime1.mp3",
  s4: "/sounds/beep1.mp3",
  s5: "/sounds/alert1.mp3",
};

export default function SessionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [invQuery, setInvQuery] = useState("");
  const lastNoticeCount = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const loadedSettings = readJSON<Settings | null>(SETTINGS_KEY, null);
      const loadedJobs = normalizeJobs(readJSON<unknown>(JOBS_KEY, []));
      const loadedInventory = normalizeInventory(readJSON<unknown>(INVENTORY_KEY, { items: [] }));
      const loadedSessions = normalizeSessions(readJSON<unknown>(SESSIONS_KEY, []));
      let nextSessions = loadedSessions;
      let current = loadedSessions.find((session) => session.id === sessionId);

      if (!current) {
        current = normalizeSession({ id: sessionId, jobId: "", startedAt: new Date().toISOString() });
        nextSessions = [current, ...loadedSessions];
        writeJSON(SESSIONS_KEY, nextSessions);
      }

      setSettings(loadedSettings);
      setJobs(loadedJobs);
      setInventory(loadedInventory);
      setSessions(nextSessions);
      setNotices(loadAllNotices());
    }, 0);
    return () => window.clearTimeout(id);
  }, [ready, sessionId]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => setNotices(loadAllNotices()), 3000);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    const visibleCount = notices.filter((notice) => !notice.hidden).length;
    if (lastNoticeCount.current > 0 && visibleCount > lastNoticeCount.current) {
      const audio = new Audio(soundMap[settings?.ui?.sound ?? "s1"] ?? soundMap.s1);
      audio.volume = 0.75;
      audio.play().catch(() => {});
    }
    lastNoticeCount.current = visibleCount;
  }, [notices, settings?.ui?.sound]);

  const session = useMemo(() => sessions.find((item) => item.id === sessionId) ?? null, [sessions, sessionId]);
  const job = useMemo(() => jobs.find((item) => item.id === session?.jobId) ?? null, [jobs, session?.jobId]);
  const serviceCounters = useMemo(() => normalizeServiceCounters(settings?.serviceCounters), [settings?.serviceCounters]);
  const sessionMs = session ? elapsedMs(session, now) : 0;
  const jobMs = useMemo(() => sessions.filter((item) => item.jobId === session?.jobId).reduce((sum, item) => sum + elapsedMs(item, now), 0), [sessions, session?.jobId, now]);
  const currentCounterMs = useMemo(() =>
    Object.fromEntries(serviceCounters.map((counter) => [counter.id, session ? counterMs(session, counter.id, now) : 0])),
  [serviceCounters, session, now]);
  const jobCounterMs = useMemo(() => {
    const forJob = sessions.filter((item) => item.jobId === session?.jobId);
    return Object.fromEntries(serviceCounters.map((counter) => [counter.id, forJob.reduce((sum, item) => sum + counterMs(item, counter.id, now), 0)]));
  }, [serviceCounters, sessions, session?.jobId, now]);
  const visibleNotices = notices.filter((notice) => !notice.hidden);
  const filteredInventory = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) => `${item.name} ${item.category} ${item.unit}`.toLowerCase().includes(q));
  }, [inventory, invQuery]);

  const usedRows = useMemo(() => {
    return (session?.usedItems ?? []).map((used) => ({
      used,
      item: inventory.find((inventoryItem) => inventoryItem.id === used.itemId),
    })).filter((row) => row.used.qty > 0);
  }, [inventory, session?.usedItems]);

  const labor = useMemo(() => ({ ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) }), [settings?.billing?.labor]);
  const defaultMaterialMode = labor.includeMaterials ? labor.materialBillingMode : "none";
  const materialEstimate = usedRows.reduce((sum, row) => sum + row.used.qty * Number(row.item?.unitPrice ?? 0), 0);
  const materialRevenueEstimate = usedRows.reduce((sum, row) => {
    const cost = row.used.qty * Number(row.item?.unitPrice ?? 0);
    return sum + materialCharge(cost, defaultMaterialMode, labor.materialBillingPercent);
  }, 0) * (1 + labor.materialMarkupPercent / 100);
  const jobMaterialExpense = useMemo(() => {
    return sessions
      .filter((item) => item.jobId === session?.jobId)
      .reduce((sum, item) => {
        if (item.id === session?.id) return sum + (labor.countMaterialsAsExpense ? materialEstimate : 0);
        const totals = materialTotalsForSession(item, inventory, labor);
        return sum + totals.expense + extraExpenseTotal(item);
      }, 0);
  }, [inventory, labor, materialEstimate, sessions, session?.id, session?.jobId]);
  const billableJobHours = labor.enabled
    ? roundedBillableHours(jobMs / 3600000, labor.minimumHours, labor.billingIncrementMinutes)
    : 0;
  const laborRevenue = labor.enabled ? billableJobHours * labor.hourlyRate : 0;
  const previousJobMaterialRevenue = useMemo(() => {
    return sessions
      .filter((item) => item.jobId === session?.jobId && item.id !== session?.id)
      .reduce((sum, item) => sum + materialTotalsForSession(item, inventory, labor).revenue, 0);
  }, [inventory, labor, sessions, session?.id, session?.jobId]);
  const materialRevenue = previousJobMaterialRevenue + materialRevenueEstimate;
  const expenseTotal = jobMaterialExpense;
  const taxableSubtotal = laborRevenue + materialRevenue;
  const taxTotal = taxableSubtotal * (labor.taxPercent / 100);
  const grossPay = taxableSubtotal + taxTotal;
  const netPay = grossPay - expenseTotal;

  function saveSession(next: SessionRecord) {
    const normalized = normalizeSession(next);
    const nextSessions = sessions.some((item) => item.id === normalized.id)
      ? sessions.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...sessions];
    setSessions(nextSessions);
    try {
      writeJSON(SESSIONS_KEY, nextSessions);
    } catch {
      writeJSON(SESSIONS_KEY, nextSessions.map((storedSession) => ({
        ...storedSession,
        photos: storedSession.photos.map((photo) => ({ ...photo, dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl) })).filter((photo) => photo.dataUrl),
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
  }

  function togglePause() {
    if (!session) return;
    const settled = settleCounters(session);
    if (!session.pausedAt) {
      saveSession({ ...session, pausedAt: new Date().toISOString(), counterElapsedMs: settled, counterStartedAt: {} });
      return;
    }
    const pausedFor = Math.max(0, Date.now() - new Date(session.pausedAt).getTime());
    const resumedAt = new Date().toISOString();
    saveSession({
      ...session,
      pausedAt: null,
      totalPausedMs: session.totalPausedMs + pausedFor,
      counterElapsedMs: settled,
      counterStartedAt: {
        ...Object.fromEntries(Object.entries(session.counters).map(([id, active]) => [id, active ? resumedAt : undefined])),
      },
    });
  }

  function toggleCounter(id: CounterId) {
    if (!session) return;
    const nextOn = !session.counters[id];
    const counterElapsedMs = settleCounters(session);
    const counterStartedAt = { ...session.counterStartedAt };
    if (nextOn && !session.pausedAt) counterStartedAt[id] = new Date().toISOString();
    else delete counterStartedAt[id];
    saveSession({ ...session, counters: { ...session.counters, [id]: nextOn }, counterElapsedMs, counterStartedAt });
  }

  function setUsedItem(itemId: string, qty: number) {
    if (!session) return;
    const next = session.usedItems.filter((item) => item.itemId !== itemId);
    if (qty > 0) next.push({ itemId, qty });
    saveSession({ ...session, usedItems: next });
  }

  function hideNotice(id: string) {
    const next = notices.map((notice) => (notice.id === id ? { ...notice, hidden: true } : notice));
    setNotices(next);
    writeJSON(NOTICES_KEY, next);
    writeJSON(NOTIFICATIONS_KEY, next);
  }

  function clearNotices() {
    const next = notices.map((notice) => ({ ...notice, hidden: true }));
    setNotices(next);
    writeJSON(NOTICES_KEY, next);
    writeJSON(NOTIFICATIONS_KEY, next);
  }

  async function addPhotos(files: FileList | null) {
    if (!session || !files?.length) return;
    const photos = await Promise.all(Array.from(files).slice(0, 6).map(async (file) => ({
      id: uid(),
      name: file.name,
      dataUrl: await photoFileToStorageDataUrl(file),
      caption: "",
      createdAt: new Date().toISOString(),
    }))).then((items) => items.filter((photo) => photo.dataUrl));
    const nextPhotos = [...session.photos, ...photos].slice(0, 16);
    saveSession({ ...session, photos: nextPhotos, photoSheet: upsertPhotoSheetPhotos(session.photoSheet, photos) });
  }

  function updatePhotoSheet(patch: Partial<PhotoSheet>) {
    if (!session) return;
    saveSession({
      ...session,
      photoSheet: {
        title: "Session Photos",
        notes: "",
        photos: [],
        ...session.photoSheet,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function updateSheetPhoto(id: string, patch: Partial<PhotoSheetItem>) {
    if (!session?.photoSheet) return;
    updatePhotoSheet({ photos: session.photoSheet.photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)) });
  }

  function removeSheetPhoto(id: string) {
    if (!session?.photoSheet) return;
    updatePhotoSheet({ photos: session.photoSheet.photos.filter((photo) => photo.id !== id) });
  }

  function moveSheetPhoto(id: string, direction: -1 | 1) {
    if (!session?.photoSheet) return;
    const index = session.photoSheet.photos.findIndex((photo) => photo.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= session.photoSheet.photos.length) return;
    const photos = [...session.photoSheet.photos];
    [photos[index], photos[nextIndex]] = [photos[nextIndex], photos[index]];
    updatePhotoSheet({ photos });
  }

  function savePhotoSheet() {
    if (!session) return;
    saveSession({
      ...session,
      photoSheet: {
        title: session.photoSheet?.title || "Session Photos",
        notes: session.photoSheet?.notes || "",
        photos: session.photoSheet?.photos ?? [],
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function endSession() {
    if (!session) return;
    const endedAt = new Date().toISOString();
    saveSession({ ...session, endedAt, endISO: endedAt, active: false, pausedAt: null, counterElapsedMs: settleCounters(session), counterStartedAt: {} });
    router.push(`/jobs/${session.id}/review`);
  }

  if (!ready || !session) return null;

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <button className="btn ghost" onClick={() => router.push("/dashboard")}>Dashboard</button>
        <div>
          <div className="micro">CURRENT JOB</div>
          <h1>{job?.name || session.jobName || "Job session"}</h1>
        </div>
        <div className="topStats">
          <PayStat label="Gross pay" value={labor.enabled ? money(grossPay) : "N/A"} />
          <PayStat label="Total expenses" value={money(expenseTotal)} />
          <PayStat label="Net pay" value={labor.enabled ? money(netPay) : "N/A"} />
          <div className={`state ${session.pausedAt ? "paused" : ""}`}>{session.pausedAt ? "Paused" : "Running"}</div>
        </div>
      </header>

      <section className="hero">
        <div className="heroMain">
          <div className="timeLabel">Session Time</div>
          <div className="sessionTime">{msToHMS(sessionMs)}</div>
          <div className="heroMeta">{msToHMS(jobMs)} total job time</div>
        </div>
        <div className="infoGrid">
          <Info label="Customer" value={job?.customerName || job?.customer || "No customer"} />
          <Info label="Vehicle" value={vehicleLabel(job) || "No vehicle"} />
          <Info label="Stage" value={session.stage || job?.stage || "Not set"} />
        </div>
      </section>

      <section className="workspace">
        <div className="stack">
          <Panel title="Session Controls" text="Pause everything for a break, or end the session when this work block is finished.">
            <div className="statusBoard">
              <div className="statusMetric">
                <span>Job type</span>
                <strong>{job?.type || "General Job"}</strong>
              </div>
              <div className="statusMetric">
                <span>Counters active</span>
                <strong>{Object.values(session.counters).filter(Boolean).length}</strong>
              </div>
              <div className="statusMetric">
                <span>Materials logged</span>
                <strong>{usedRows.length}</strong>
              </div>
              <div className={`statusMetric live ${session.pausedAt ? "paused" : ""}`}>
                <span>Status</span>
                <strong>{session.pausedAt ? "Paused" : "Running"}</strong>
              </div>
            </div>
            <div className="actions">
              <button className="btn" onClick={togglePause}>{session.pausedAt ? "Resume Session" : "Pause Session"}</button>
              <button className="btn danger" onClick={endSession}>End Session</button>
            </div>
          </Panel>

          <Panel title="Hour Counters" text="Toggle only the counters that are actively being used right now.">
            <div className="counterGrid">
              {serviceCounters.map((counter) => (
                <Counter
                  key={counter.id}
                  label={counter.name}
                  active={Boolean(session.counters[counter.id])}
                  value={Number(currentCounterMs[counter.id] ?? 0) / 3600000}
                  jobValue={Number(jobCounterMs[counter.id] ?? 0) / 3600000}
                  onClick={() => toggleCounter(counter.id)}
                />
              ))}
            </div>
            <label className="label">Notes<textarea className="input area" value={session.notes} onChange={(event) => saveSession({ ...session, notes: event.target.value })} placeholder="Work performed, findings, paint conditions, issues..." /></label>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Notifications" text="Live alerts play the selected system sound when new ones appear.">
            <div className="noticeActions"><button className="btn ghost" onClick={clearNotices}>Clear Alerts</button></div>
            <div className="noticeList">
              {visibleNotices.slice(0, 8).map((notice) => <div className={`notice ${notice.level}`} key={notice.id}><div><strong>{notice.title}</strong>{notice.body && <span>{notice.body}</span>}</div><button className="btn sm" onClick={() => hideNotice(notice.id)}>Hide</button></div>)}
              {visibleNotices.length === 0 && <div className="empty">No active alerts.</div>}
            </div>
          </Panel>

          <Panel title="Materials" text="Quantities carry to clock-out review, where inventory is reduced.">
            <input className="input" value={invQuery} onChange={(event) => setInvQuery(event.target.value)} placeholder="Search inventory..." />
            <div className="materialList">
              {filteredInventory.slice(0, 24).map((item) => {
                const existing = session.usedItems.find((used) => used.itemId === item.id);
                const projected = Math.max(0, item.quantity - Number(existing?.qty || 0));
                return (
                  <div className="material" key={item.id}>
                    <div>
                      <strong>{item.name || "Unnamed item"}</strong>
                      <span>{item.quantity} {item.unit} on hand - {money(item.unitPrice)} / {item.unit}</span>
                      {existing?.qty ? <small>After review: {projected} {item.unit}</small> : null}
                    </div>
                    <DecimalInput className="qty" value={existing?.qty ?? ""} onValueChange={(value) => setUsedItem(item.id, value)} placeholder="0" />
                  </div>
                );
              })}
              {inventory.length === 0 && <div className="empty">No inventory set up yet.</div>}
            </div>
            <div className="materialTotal"><span>{usedRows.length} material line(s)</span><strong>{money(materialEstimate)}</strong></div>
          </Panel>
        </div>
      </section>

      <section className="photos">
        <div>
          <div className="panelTitle">Photo Sheet</div>
          <div className="panelText">Arrange photos, add captions, and keep them with this session.</div>
        </div>
        <div className="photoActions">
          <label className="btn ghost">Add Photos<input type="file" accept="image/*" multiple onChange={(event) => addPhotos(event.target.files)} style={{ display: "none" }} /></label>
          <button className="btn primary" onClick={savePhotoSheet}>Save Photo Sheet</button>
        </div>
        <div className="photoSheetList">
          {(session.photoSheet?.photos ?? []).map((photo, index) => (
            <article className="photoRow" key={photo.id}>
              <img src={photo.dataUrl} alt={photo.caption || photo.name} />
              <div>
                <div className="photoMeta">Photo {index + 1} - {photo.name}</div>
                <textarea className="input photoCaption" value={photo.caption} onChange={(event) => updateSheetPhoto(photo.id, { caption: event.target.value })} placeholder="Caption..." />
                <div className="photoActions">
                  <button className="btn ghost" disabled={index === 0} onClick={() => moveSheetPhoto(photo.id, -1)}>Move Up</button>
                  <button className="btn ghost" disabled={index === (session.photoSheet?.photos.length ?? 0) - 1} onClick={() => moveSheetPhoto(photo.id, 1)}>Move Down</button>
                  <button className="btn danger" onClick={() => removeSheetPhoto(photo.id)}>Remove</button>
                </div>
              </div>
            </article>
          ))}
          {(session.photoSheet?.photos.length ?? 0) === 0 && <div className="empty">No photos added yet.</div>}
        </div>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function loadAllNotices() {
  return [
    ...normalizeNotices(readJSON<unknown>(NOTICES_KEY, [])),
    ...normalizeNotices(readJSON<unknown>(NOTIFICATIONS_KEY, [])),
  ];
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function PayStat({ label, value }: { label: string; value: string }) {
  return <div className="payStat"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <section className="panel"><div><div className="panelTitle">{title}</div><div className="panelText">{text}</div></div>{children}</section>;
}

function Counter({ label, active, value, jobValue, onClick }: { label: string; active: boolean; value: number; jobValue: number; onClick: () => void }) {
  return (
    <button className={`counter ${active ? "on" : "off"}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value.toFixed(2)} hr {active ? "" : "(Off)"}</strong>
      <small>{jobValue.toFixed(2)} hr job total</small>
    </button>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .hero, .workspace, .photos { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 14px; display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 14px; align-items: center; backdrop-filter: blur(10px); }
  .topStats { display: flex; align-items: stretch; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .payStat { min-width: 112px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; padding: 9px 10px; display: grid; gap: 3px; }
  .payStat span { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; opacity: .66; font-weight: 950; }
  .payStat strong { font-size: 15px; line-height: 1.1; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 2px 0 0; font-size: clamp(28px, 4vw, 48px); line-height: .95; }
  .state { border: 1px solid rgba(160,230,255,.25); background: rgba(120,200,255,.1); border-radius: 999px; padding: 9px 12px; font-weight: 1000; }
  .state.paused { border-color: rgba(255,190,90,.35); background: rgba(255,190,90,.11); }
  .hero { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.44); border-radius: 18px; padding: 16px; display: grid; grid-template-columns: minmax(280px,.55fr) minmax(0,1fr); gap: 12px; align-items: stretch; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .heroMain { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 16px; display: grid; align-content: center; min-height: 128px; }
  .timeLabel { font-size: 12px; letter-spacing: 1.5px; opacity: .68; text-transform: uppercase; font-weight: 1000; }
  .sessionTime { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(42px, 5.6vw, 70px); font-weight: 1000; line-height: .92; margin-top: 8px; letter-spacing: -1px; }
  .heroMeta { color: rgba(238,241,243,.72); margin-top: 10px; font-weight: 850; font-size: 15px; }
  .infoGrid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; align-content: stretch; }
  .info { border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.055); border-radius: 12px; padding: 14px; display: grid; gap: 8px; min-width: 0; align-content: center; min-height: 128px; }
  .info span { font-size: 11px; letter-spacing: 1.5px; opacity: .62; text-transform: uppercase; font-weight: 950; }
  .info strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 18px; line-height: 1.2; }
  .workspace { display: grid; grid-template-columns: minmax(0,1fr) minmax(380px,.7fr); gap: 14px; align-items: start; }
  .stack { display: grid; gap: 14px; }
  .panel, .photos { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 16px; padding: 16px; display: grid; gap: 13px; backdrop-filter: blur(10px); }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .panelText { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.35; margin-top: 3px; }
  .formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .statusBoard { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
  .statusMetric { border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.045); border-radius: 12px; padding: 12px; display: grid; gap: 6px; min-width: 0; }
  .statusMetric span { color: rgba(238,241,243,.64); font-size: 10px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 950; }
  .statusMetric strong { font-size: 18px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .statusMetric.live { border-color: rgba(150,220,255,.3); background: rgba(120,200,255,.1); }
  .statusMetric.live.paused { border-color: rgba(255,190,90,.35); background: rgba(255,190,90,.11); }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .area { min-height: 150px; resize: vertical; }
  .actions, .noticeActions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .btn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; font-weight: 950; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .sm { padding: 7px 9px; font-size: 12px; }
  .counterGrid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
  .counter { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 10px; padding: 12px; cursor: pointer; display: grid; gap: 5px; text-align: left; }
  .counter.on { border-color: rgba(150,220,255,.32); background: rgba(120,200,255,.11); }
  .counter.off { opacity: .55; filter: grayscale(.35); }
  .counter span { color: rgba(238,241,243,.72); font-size: 12px; line-height: 1.25; }
  .counter { grid-template-columns: minmax(0,1fr) auto; align-items: center; }
  .counter strong { justify-self: end; }
  .counter small { grid-column: 1 / -1; color: rgba(238,241,243,.58); font-size: 12px; }
  .materialList, .noticeList { display: grid; gap: 8px; max-height: 380px; overflow: auto; padding-right: 4px; }
  .material { display: grid; grid-template-columns: minmax(0,1fr) 82px; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.045); border-radius: 10px; padding: 10px; }
  .material div { display: grid; gap: 4px; min-width: 0; }
  .material span, .material small { color: rgba(238,241,243,.68); font-size: 12px; }
  .material small { color: rgba(190,255,170,.9); }
  .qty { width: 82px; text-align: right; font-weight: 950; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 10px; outline: none; }
  .materialTotal { display: flex; justify-content: space-between; gap: 12px; border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.055); border-radius: 10px; padding: 11px 12px; }
  .notice { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; padding: 11px; display: flex; justify-content: space-between; gap: 10px; }
  .notice div { display: grid; gap: 4px; }
  .notice span { color: rgba(238,241,243,.72); font-size: 13px; }
  .notice.warn { border-color: rgba(255,190,80,.34); background: rgba(255,190,80,.1); }
  .notice.danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .empty { color: rgba(238,241,243,.7); font-size: 13px; padding: 8px 2px; }
  .photos { align-items: start; }
  .photoActions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .photoSheetList { display: grid; gap: 10px; }
  .photoRow { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 10px; display: grid; grid-template-columns: 170px minmax(0,1fr); gap: 10px; align-items: start; }
  .photoRow img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.22); }
  .photoMeta { color: rgba(238,241,243,.68); font-size: 12px; font-weight: 850; margin-bottom: 7px; }
  .photoCaption { min-height: 76px; resize: vertical; margin-bottom: 8px; }
  @media (max-width: 980px) { .wrap { padding: 14px; } .topbar, .hero, .workspace, .formGrid, .counterGrid, .photos, .photoRow { grid-template-columns: 1fr; } .statusBoard { grid-template-columns: 1fr 1fr; } .topStats { justify-content: stretch; } .payStat { flex: 1 1 130px; } .infoGrid { grid-template-columns: 1fr 1fr; } .heroMain, .info { min-height: auto; } .actions, .noticeActions, .photoActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .materialList, .noticeList { max-height: none; } }
  @media (max-width: 620px) { .infoGrid, .statusBoard { grid-template-columns: 1fr; } .material { grid-template-columns: 1fr; } .qty { width: 100%; } }
`;
