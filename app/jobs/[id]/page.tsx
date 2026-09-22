"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";
import { DEFAULT_LABOR_BILLING, type LaborBillingSettings, type MaterialBillingMode, type Settings } from "@/lib/setupData";

type JobStatus = "active" | "done";
type Equipment = "p100" | "p95ov_weldsand" | "p95ov_spray" | "supplied_air" | "booth" | "devilbiss";

type BillingEstimate = {
  grossPay: number;
  totalExpenses: number;
  netPay: number;
  laborTotal: number;
  materialRevenue: number;
  materialCost: number;
  extraExpenses?: number;
  taxTotal: number;
  updatedAt: string;
};

type Job = {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  customer?: string;
  customerName?: string;
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string; plate?: string; paint?: string };
  vin?: string;
  stage?: string;
  status?: JobStatus;
  createdAt?: string;
  createdAtISO?: string;
  completedAt?: string;
  invoiceReady?: boolean;
  billingEstimate?: BillingEstimate;
};

type UsedItem = {
  itemId: string;
  qty: number;
  billingMode?: MaterialBillingMode;
  billingPercent?: number;
  countAsExpense?: boolean;
};

type ExtraExpense = { id: string; name: string; amount: number };

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
  active?: boolean;
  stage?: string;
  task?: string;
  equipment?: Equipment[] | Record<string, unknown>;
  counters?: Partial<Record<"spray_hours" | "supplied_air_hours" | "weld_sand_hours", boolean>>;
  counterElapsedMs?: Partial<Record<"spray_hours" | "supplied_air_hours" | "weld_sand_hours", number>>;
  usedItems?: UsedItem[];
  extraExpenses?: ExtraExpense[];
  notes?: string;
  photos?: { name: string; dataUrl: string }[];
  images?: { id: string; name: string; dataUrl: string; createdISO: string }[];
  materialTotal?: number;
  reviewedAt?: string;
};

type InventoryItem = {
  id: string;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
};

const INVOICES_KEY = "marshall_invoices_v1";
const PHOTO_SHEETS_KEY = "marshall_job_photo_sheets_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key] as T[];
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items as T[];
  if (isRecord(raw) && Array.isArray(raw.jobs)) return raw.jobs as T[];
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions as T[];
  return [];
}

function isBillingMode(value: unknown): value is MaterialBillingMode {
  return value === "none" || value === "percent" || value === "all";
}

function isBillingEstimate(value: unknown): value is BillingEstimate {
  return isRecord(value) && Number.isFinite(Number(value.grossPay));
}

function normalizeJobs(raw: unknown): Job[] {
  return asList<Record<string, unknown>>(raw, "jobs").filter(isRecord).map((job) => ({
    id: String(job.id ?? uid()),
    title: typeof job.title === "string" ? job.title : typeof job.name === "string" ? job.name : "Untitled job",
    name: typeof job.name === "string" ? job.name : typeof job.title === "string" ? job.title : "Untitled job",
    type: typeof job.type === "string" ? job.type : undefined,
    customer: typeof job.customer === "string" ? job.customer : undefined,
    customerName: typeof job.customerName === "string" ? job.customerName : typeof job.customer === "string" ? job.customer : undefined,
    vehicle: typeof job.vehicle === "string" || isRecord(job.vehicle) ? (job.vehicle as Job["vehicle"]) : undefined,
    vin: typeof job.vin === "string" ? job.vin : undefined,
    stage: typeof job.stage === "string" ? job.stage : undefined,
    status: job.status === "done" ? "done" : "active",
    createdAt: typeof job.createdAt === "string" ? job.createdAt : undefined,
    createdAtISO: typeof job.createdAtISO === "string" ? job.createdAtISO : undefined,
    completedAt: typeof job.completedAt === "string" ? job.completedAt : undefined,
    invoiceReady: Boolean(job.invoiceReady),
    billingEstimate: isBillingEstimate(job.billingEstimate) ? job.billingEstimate : undefined,
  }));
}

function normalizeSessions(raw: unknown): Session[] {
  return asList<Record<string, unknown>>(raw, "sessions").filter(isRecord).map((session) => ({
    id: String(session.id ?? uid()),
    jobId: String(session.jobId ?? ""),
    jobName: typeof session.jobName === "string" ? session.jobName : undefined,
    startedAt: typeof session.startedAt === "string" ? session.startedAt : undefined,
    startISO: typeof session.startISO === "string" ? session.startISO : undefined,
    endedAt: typeof session.endedAt === "string" ? session.endedAt : session.endedAt === null ? null : undefined,
    endISO: typeof session.endISO === "string" ? session.endISO : undefined,
    elapsedSec: Number.isFinite(Number(session.elapsedSec)) ? Number(session.elapsedSec) : undefined,
    totalPausedMs: Number.isFinite(Number(session.totalPausedMs)) ? Number(session.totalPausedMs) : 0,
    active: session.active === true,
    stage: typeof session.stage === "string" ? session.stage : undefined,
    task: typeof session.task === "string" ? session.task : undefined,
    equipment: Array.isArray(session.equipment) || isRecord(session.equipment) ? (session.equipment as Session["equipment"]) : undefined,
    counters: isRecord(session.counters) ? session.counters : undefined,
    counterElapsedMs: isRecord(session.counterElapsedMs) ? session.counterElapsedMs : undefined,
    usedItems: Array.isArray(session.usedItems)
      ? session.usedItems.filter(isRecord).map((item) => ({
        itemId: String(item.itemId ?? ""),
        qty: Number(item.qty ?? 0),
        billingMode: isBillingMode(item.billingMode) ? item.billingMode : undefined,
        billingPercent: Number.isFinite(Number(item.billingPercent)) ? Number(item.billingPercent) : undefined,
        countAsExpense: typeof item.countAsExpense === "boolean" ? item.countAsExpense : undefined,
      })).filter((item) => item.itemId)
      : [],
    extraExpenses: Array.isArray(session.extraExpenses)
      ? session.extraExpenses.filter(isRecord).map((expense) => ({
        id: String(expense.id ?? uid()),
        name: String(expense.name ?? "Unmarked expense"),
        amount: Number.isFinite(Number(expense.amount)) ? Number(expense.amount) : 0,
      })).filter((expense) => expense.amount > 0)
      : [],
    notes: typeof session.notes === "string" ? session.notes : undefined,
    photos: Array.isArray(session.photos) ? session.photos as Session["photos"] : [],
    images: Array.isArray(session.images) ? session.images as Session["images"] : [],
    materialTotal: Number.isFinite(Number(session.materialTotal)) ? Number(session.materialTotal) : undefined,
    reviewedAt: typeof session.reviewedAt === "string" ? session.reviewedAt : undefined,
  }));
}

function normalizeInventory(raw: unknown): InventoryItem[] {
  return asList<Record<string, unknown>>(raw, "items").filter(isRecord).map((item) => ({
    id: String(item.id ?? uid()),
    name: typeof item.name === "string" ? item.name : undefined,
    unit: typeof item.unit === "string" ? item.unit : undefined,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : undefined,
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
  }));
}

function invoiceMatchesJob(invoice: unknown, jobId: string) {
  if (!isRecord(invoice)) return false;
  const invoiceJobId = String(invoice.jobId ?? "");
  const invoiceJobIds = Array.isArray(invoice.jobIds) ? invoice.jobIds.map((id) => String(id)) : [];
  return invoiceJobId === jobId || invoiceJobIds.includes(jobId);
}

function sessionMs(session: Session, now: Date) {
  if (Number.isFinite(Number(session.elapsedSec))) return Math.max(0, Number(session.elapsedSec) * 1000);
  const start = new Date(session.startedAt || session.startISO || now.toISOString()).getTime();
  const end = session.endedAt || session.endISO ? new Date(session.endedAt || session.endISO || now.toISOString()).getTime() : now.getTime();
  return Math.max(0, end - start - (session.totalPausedMs || 0));
}

function materialCharge(cost: number, mode: MaterialBillingMode, percent: number) {
  if (mode === "none") return 0;
  if (mode === "percent") return cost * Math.max(0, percent) / 100;
  return cost;
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
        revenue: totals.revenue + revenueBeforeMarkup * (1 + labor.materialMarkupPercent / 100),
        expense: totals.expense + (used.countAsExpense ?? labor.countMaterialsAsExpense ? cost : 0),
      };
    },
    { cost: Number(session.materialTotal ?? 0), revenue: 0, expense: 0 }
  );
}

function extraExpenseTotal(session: Session) {
  return (session.extraExpenses ?? []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function roundedBillableHours(rawHours: number, minimumHours: number, incrementMinutes: number) {
  const base = Math.max(rawHours, minimumHours || 0);
  const incrementHours = incrementMinutes > 0 ? incrementMinutes / 60 : 0;
  if (!incrementHours) return base;
  return Math.ceil(base / incrementHours) * incrementHours;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function msToHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")} hr`;
}

function shortDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function titleFor(job: Job) {
  return job.title || job.name || "Untitled job";
}

function vehicleFor(job: Job) {
  if (!job.vehicle) return "";
  if (typeof job.vehicle === "string") return job.vehicle;
  return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
}

function vinFor(job: Job) {
  if (job.vin) return job.vin;
  if (isRecord(job.vehicle) && typeof job.vehicle.vin === "string") return job.vehicle.vin;
  return "";
}

function equipmentArray(value: Session["equipment"]): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!isRecord(value)) return [];
  const out: string[] = [];
  if (value.booth) out.push("booth");
  if (value.devilbiss) out.push("devilbiss");
  if (value.suppliedAir || value.supplied_air) out.push("supplied_air");
  if (typeof value.respirator === "string") out.push(value.respirator);
  return out;
}

function equipmentLabel(value: string) {
  if (value === "p95ov_weldsand") return "P95 + OV Weld/Sand";
  if (value === "p95ov_spray") return "P95 + OV Spray";
  if (value === "supplied_air") return "Supplied Air";
  if (value === "devilbiss") return "Devilbiss Air";
  if (value === "booth") return "Spray Booth";
  if (value === "p100") return "P100";
  return value;
}

function estimateJob(job: Job, sessions: Session[], inventory: InventoryItem[], settings: Settings | null, now: Date) {
  const labor = { ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) };
  const jobSessions = sessions.filter((session) => session.jobId === job.id);
  const totalMs = jobSessions.reduce((sum, session) => sum + sessionMs(session, now), 0);
  const totals = jobSessions.reduce(
    (sum, session) => {
      const materials = materialTotalsForSession(session, inventory, labor);
      const extras = extraExpenseTotal(session);
      return {
        cost: sum.cost + materials.cost,
        revenue: sum.revenue + materials.revenue,
        expenses: sum.expenses + materials.expense + extras,
        extras: sum.extras + extras,
      };
    },
    { cost: 0, revenue: 0, expenses: 0, extras: 0 }
  );

  if (!labor.enabled) {
    return {
      totalMs,
      sessionCount: jobSessions.length,
      activeSession: jobSessions.find((session) => session.active),
      grossPay: job.billingEstimate?.grossPay ?? null,
      netPay: job.billingEstimate?.netPay ?? null,
      laborTotal: job.billingEstimate?.laborTotal ?? null,
      taxTotal: job.billingEstimate?.taxTotal ?? 0,
      materialRevenue: job.billingEstimate?.materialRevenue ?? totals.revenue,
      materialCost: totals.cost,
      extraExpenses: totals.extras,
      totalExpenses: totals.expenses,
    };
  }

  const billableHours = roundedBillableHours(totalMs / 3600000, labor.minimumHours, labor.billingIncrementMinutes);
  const laborTotal = billableHours * labor.hourlyRate;
  const taxableSubtotal = laborTotal + totals.revenue;
  const taxTotal = taxableSubtotal * (labor.taxPercent / 100);
  const grossPay = taxableSubtotal + taxTotal;

  return {
    totalMs,
    sessionCount: jobSessions.length,
    activeSession: jobSessions.find((session) => session.active),
    grossPay,
    netPay: grossPay - totals.expenses,
    laborTotal,
    taxTotal,
    materialRevenue: totals.revenue,
    materialCost: totals.cost,
    extraExpenses: totals.extras,
    totalExpenses: totals.expenses,
  };
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", customer: "", vehicle: "", type: "", stage: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const done = localStorage.getItem(KEYS.setupComplete) === "true";
      if (!done) {
        router.push("/setup");
        return;
      }
      const loadedJobs = normalizeJobs(loadJSON<unknown>(KEYS.jobs, []));
      setJobs(loadedJobs);
      setSessions(normalizeSessions(loadJSON<unknown>(KEYS.sessions, [])));
      setInventory(normalizeInventory(loadJSON<unknown>(KEYS.inventory, { items: [] })));
      setSettings(loadJSON<Settings | null>(KEYS.settings, null));
      const found = loadedJobs.find((job) => job.id === jobId);
      if (found) {
        setDraft({
          title: titleFor(found),
          customer: found.customerName || found.customer || "",
          vehicle: vehicleFor(found),
          type: found.type || "",
          stage: found.stage || "",
        });
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [jobId, ready, router]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [ready]);

  const job = useMemo(() => jobs.find((item) => item.id === jobId) ?? null, [jobs, jobId]);
  const jobSessions = useMemo(() => sessions.filter((session) => session.jobId === jobId), [sessions, jobId]);
  const estimate = job ? estimateJob(job, sessions, inventory, settings, now) : null;
  const activeSession = estimate?.activeSession;
  const allMaterials = useMemo(() => {
    return jobSessions.flatMap((session) =>
      (session.usedItems ?? []).map((used) => {
        const item = inventory.find((inventoryItem) => inventoryItem.id === used.itemId);
        const cost = used.qty * Number(item?.unitPrice ?? 0);
        return { session, used, item, cost };
      })
    );
  }, [inventory, jobSessions]);
  const allExpenses = jobSessions.flatMap((session) => (session.extraExpenses ?? []).map((expense) => ({ session, expense })));
  const latestNotes = jobSessions.filter((session) => session.notes?.trim()).slice(0, 6);

  const saveJobs = (next: Job[]) => {
    setJobs(next);
    saveJSON(KEYS.jobs, next);
  };

  const saveDraft = () => {
    if (!job) return;
    const next = jobs.map((item) =>
      item.id === job.id
        ? {
            ...item,
            title: draft.title.trim() || titleFor(item),
            name: draft.title.trim() || titleFor(item),
            customer: draft.customer.trim() || undefined,
            customerName: draft.customer.trim() || undefined,
            vehicle: draft.vehicle.trim() || undefined,
            type: draft.type.trim() || undefined,
            stage: draft.stage.trim() || undefined,
          }
        : item
    );
    saveJobs(next);
    setEditing(false);
  };

  const reopenJob = () => {
    if (!job || !window.confirm("Reopen this job and move it back to active?")) return;
    saveJobs(jobs.map((item) => (item.id === job.id ? { ...item, status: "active" as const, invoiceReady: false, completedAt: undefined } : item)));
  };

  const deleteJob = () => {
    if (!job) return;
    const nextJobs = jobs.filter((item) => item.id !== job.id);
    const nextSessions = sessions.filter((session) => session.jobId !== job.id);
    const nextInvoices = asList<unknown>(loadJSON<unknown>(INVOICES_KEY, []), "invoices").filter((invoice) => !invoiceMatchesJob(invoice, job.id));
    const photoSheets = loadJSON<Record<string, unknown>>(PHOTO_SHEETS_KEY, {});
    if (isRecord(photoSheets)) {
      delete photoSheets[job.id];
      saveJSON(PHOTO_SHEETS_KEY, photoSheets);
    }

    saveJSON(KEYS.jobs, nextJobs);
    saveJSON(KEYS.sessions, nextSessions);
    saveJSON(INVOICES_KEY, nextInvoices);
    router.push("/jobs");
  };

  if (!ready) return null;

  if (!job || !estimate) {
    return (
      <main className="wrap">
        <ApplyWallpaper />
        <section className="panel single">
          <div className="panelTitle">Job not found.</div>
          <Link className="btn ghost" href="/jobs">Back to Jobs</Link>
        </section>
        <style jsx global>{styles}</style>
      </main>
    );
  }

  const linkedInvoiceCount = asList<unknown>(loadJSON<unknown>(INVOICES_KEY, []), "invoices").filter((invoice) => invoiceMatchesJob(invoice, job.id)).length;

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">JOB DETAIL</div>
          <h1>{titleFor(job)}</h1>
          <p>{job.customerName || job.customer || "No customer"} · {vehicleFor(job) || "No vehicle"} · {job.stage || "No stage"}</p>
        </div>
        <div className="topActions">
          <Link className="btn ghost" href="/jobs">Jobs</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
          <Link className="btn ghost" href={`/jobs/${job.id}/photos`}>Photos</Link>
          {activeSession ? (
            <Link className="btn primary" href={`/session/${activeSession.id}`}>Open Session</Link>
          ) : job.status === "done" ? (
            <button className="btn" onClick={reopenJob}>Reopen Job</button>
          ) : (
            <Link className="btn primary" href="/clock-in">Start Session</Link>
          )}
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete Job</button>
        </div>
      </header>

      <section className="statusStrip">
        <Metric label="Status" value={job.status === "done" ? "Done" : activeSession ? "Running" : "Active"} tone={activeSession ? "live" : "normal"} />
        <Metric label="Total time" value={msToHMS(estimate.totalMs)} />
        <Metric label="Gross pay" value={estimate.grossPay === null ? "N/A" : money(estimate.grossPay)} />
        <Metric label="Expenses" value={money(estimate.totalExpenses)} />
        <Metric label="Net pay" value={estimate.netPay === null ? "N/A" : money(estimate.netPay)} />
      </section>

      <section className="layout">
        <div className="stack">
          <section className="panel">
            <div className="panelTop">
              <div>
                <div className="panelTitle">Job Info</div>
                <div className="panelText">Customer, vehicle, workflow, and invoice readiness.</div>
              </div>
              <button className="btn ghost" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit"}</button>
            </div>

            {editing ? (
              <div className="formGrid">
                <label className="label">Job title<input className="input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="label">Customer<input className="input" value={draft.customer} onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} /></label>
                <label className="label">Vehicle<input className="input" value={draft.vehicle} onChange={(event) => setDraft((current) => ({ ...current, vehicle: event.target.value }))} /></label>
                <label className="label">Type<input className="input" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))} /></label>
                <label className="label">Stage<input className="input" value={draft.stage} onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value }))} /></label>
                <button className="btn primary saveBtn" onClick={saveDraft}>Save Job Info</button>
              </div>
            ) : (
              <div className="infoGrid">
                <Info label="Customer" value={job.customerName || job.customer || "No customer"} />
                <Info label="Vehicle" value={vehicleFor(job) || "No vehicle"} />
                <Info label="VIN" value={vinFor(job) || "No VIN"} />
                <Info label="Type" value={job.type || "General"} />
                <Info label="Stage" value={job.stage || "Not set"} />
                <Info label="Created" value={shortDate(job.createdAt || job.createdAtISO)} />
                <Info label="Invoice" value={job.invoiceReady ? "Ready" : "Not ready"} />
                <Info label="Completed" value={job.completedAt ? shortDate(job.completedAt) : "Not completed"} />
              </div>
            )}
          </section>

          <section className="panel">
            <div>
              <div className="panelTitle">Sessions</div>
              <div className="panelText">Every clock-in tied to this job.</div>
            </div>
            <div className="sessionList">
              {jobSessions.map((session) => {
                const materials = materialTotalsForSession(session, inventory, { ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) });
                return (
                  <article className={`sessionRow ${session.active ? "live" : ""}`} key={session.id}>
                    <div>
                      <strong>{session.stage || session.task || "Session"}</strong>
                      <span>{shortDate(session.startedAt || session.startISO)} · {msToHMS(sessionMs(session, now))}</span>
                    </div>
                    <div className="sessionMeta">
                      <span>{money(materials.expense + extraExpenseTotal(session))} expenses</span>
                      <span>{equipmentArray(session.equipment).map(equipmentLabel).join(", ") || "No equipment"}</span>
                    </div>
                    {session.active ? <Link className="btn primary" href={`/session/${session.id}`}>Open</Link> : <Link className="btn ghost" href={`/jobs/${session.id}/review`}>Review</Link>}
                  </article>
                );
              })}
              {jobSessions.length === 0 && <div className="empty">No sessions yet.</div>}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panelTitle">Estimate Breakdown</div>
            <div className="moneyList">
              <MoneyLine label="Labor" value={estimate.laborTotal === null ? "N/A" : money(estimate.laborTotal)} />
              <MoneyLine label="Material billed" value={money(estimate.materialRevenue)} />
              <MoneyLine label="Tax" value={money(estimate.taxTotal)} />
              <MoneyLine label="Raw material cost" value={money(estimate.materialCost)} />
              <MoneyLine label="Extra expenses" value={money(estimate.extraExpenses)} />
              <MoneyLine label="Total expenses" value={money(estimate.totalExpenses)} strong />
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">Materials</div>
            <div className="compactList">
              {allMaterials.slice(0, 10).map(({ session, used, item, cost }) => (
                <div className="compactRow" key={`${session.id}-${used.itemId}`}>
                  <span>{item?.name || "Unknown item"} · {used.qty} {item?.unit || ""}</span>
                  <strong>{money(cost)}</strong>
                </div>
              ))}
              {allMaterials.length === 0 && <div className="empty">No materials logged.</div>}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">Expenses</div>
            <div className="compactList">
              {allExpenses.map(({ session, expense }) => (
                <div className="compactRow" key={`${session.id}-${expense.id}`}>
                  <span>{expense.name}</span>
                  <strong>{money(expense.amount)}</strong>
                </div>
              ))}
              {allExpenses.length === 0 && <div className="empty">No extra expenses.</div>}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">Notes</div>
            <div className="compactList">
              {latestNotes.map((session) => (
                <div className="note" key={session.id}>
                  <strong>{session.stage || session.task || shortDate(session.startedAt || session.startISO)}</strong>
                  <span>{session.notes}</span>
                </div>
              ))}
              {latestNotes.length === 0 && <div className="empty">No notes yet.</div>}
            </div>
          </section>
        </aside>
      </section>

      {confirmDelete && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Confirm job delete">
          <div className="modal">
            <div>
              <div className="panelTitle">Confirm job deletion</div>
              <p>
                This will permanently delete "{titleFor(job)}", all sessions for this job,
                the job photo sheet, and {linkedInvoiceCount} linked invoice{linkedInvoiceCount === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="modalActions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn danger" onClick={deleteJob}>Delete Job</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "live" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function MoneyLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`moneyLine ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .statusStrip, .layout, .single { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .panelTop { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
  .btn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .statusStrip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  .metric, .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 14px; backdrop-filter: blur(10px); }
  .metric { padding: 14px; display: grid; gap: 4px; }
  .metric.live { border-color: rgba(150,220,255,.34); background: rgba(120,200,255,.1); }
  .metric span, .info span, .moneyLine span, .compactRow span, .sessionRow span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .metric strong { font-size: 24px; white-space: nowrap; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, .38fr); gap: 14px; align-items: start; }
  .stack { display: grid; gap: 14px; }
  .panel { padding: 16px; display: grid; gap: 13px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .infoGrid, .formGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .formGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .info, .moneyLine, .compactRow { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 10px; padding: 10px; display: grid; gap: 5px; min-width: 0; }
  .info strong, .compactRow strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .saveBtn { align-self: end; }
  .sessionList, .compactList, .moneyList { display: grid; gap: 8px; }
  .sessionRow { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 12px; display: grid; grid-template-columns: minmax(0,1fr) minmax(180px,.34fr) auto; gap: 10px; align-items: center; }
  .sessionRow.live { border-color: rgba(150,220,255,.34); background: rgba(120,200,255,.1); }
  .sessionRow div, .sessionMeta, .note { display: grid; gap: 4px; min-width: 0; }
  .sessionMeta span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .compactRow { grid-template-columns: minmax(0,1fr) auto; align-items: center; }
  .moneyLine { grid-template-columns: minmax(0,1fr) auto; align-items: center; }
  .moneyLine.strong { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.18); }
  .note { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 10px; padding: 10px; }
  .note span { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.35; }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); }
  .modalShade { position: fixed; inset: 0; background: rgba(0,0,0,.64); display: grid; place-items: center; padding: 18px; z-index: 20; }
  .modal { width: min(520px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .modalActions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  @media (max-width: 1080px) { .statusStrip { grid-template-columns: repeat(2, minmax(0,1fr)); } .layout, .sessionRow { grid-template-columns: 1fr; } .infoGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 680px) { .wrap { padding: 12px; } .topbar { display: grid; } .topActions, .modalActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .statusStrip, .infoGrid, .formGrid { grid-template-columns: 1fr; } h1 { font-size: 38px; } }
`;
