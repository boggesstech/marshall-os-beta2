"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";
import { DEFAULT_LABOR_BILLING, type LaborBillingSettings, type MaterialBillingMode, type Settings } from "@/lib/setupData";

type JobStatus = "active" | "done";

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
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string };
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
  startedAt?: string;
  startISO?: string;
  endedAt?: string | null;
  endISO?: string | null;
  elapsedSec?: number;
  totalPausedMs?: number;
  active?: boolean;
  stage?: string;
  task?: string;
  usedItems?: UsedItem[];
  extraExpenses?: ExtraExpense[];
  materialTotal?: number;
};

type InventoryItem = {
  id: string;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
};

type ViewMode = "active" | "completed" | "all";
const INVOICES_KEY = "marshall_invoices_v1";
const PHOTO_SHEETS_KEY = "marshall_job_photo_sheets_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isMaterialBillingMode(value: unknown): value is MaterialBillingMode {
  return value === "none" || value === "percent" || value === "all";
}

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key] as T[];
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items as T[];
  if (isRecord(raw) && Array.isArray(raw.jobs)) return raw.jobs as T[];
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions as T[];
  return [];
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

function isBillingEstimate(value: unknown): value is BillingEstimate {
  return isRecord(value) && Number.isFinite(Number(value.grossPay));
}

function normalizeSessions(raw: unknown): Session[] {
  return asList<Record<string, unknown>>(raw, "sessions").filter(isRecord).map((session) => ({
    id: String(session.id ?? uid()),
    jobId: String(session.jobId ?? ""),
    startedAt: typeof session.startedAt === "string" ? session.startedAt : undefined,
    startISO: typeof session.startISO === "string" ? session.startISO : undefined,
    endedAt: typeof session.endedAt === "string" ? session.endedAt : session.endedAt === null ? null : undefined,
    endISO: typeof session.endISO === "string" ? session.endISO : undefined,
    elapsedSec: Number.isFinite(Number(session.elapsedSec)) ? Number(session.elapsedSec) : undefined,
    totalPausedMs: Number.isFinite(Number(session.totalPausedMs)) ? Number(session.totalPausedMs) : 0,
    active: session.active === true,
    stage: typeof session.stage === "string" ? session.stage : undefined,
    task: typeof session.task === "string" ? session.task : undefined,
    usedItems: Array.isArray(session.usedItems)
      ? session.usedItems.filter(isRecord).map((item) => ({
        itemId: String(item.itemId ?? ""),
        qty: Number(item.qty ?? 0),
        billingMode: isMaterialBillingMode(item.billingMode) ? item.billingMode : undefined,
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
    materialTotal: Number.isFinite(Number(session.materialTotal)) ? Number(session.materialTotal) : undefined,
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

function msToHours(ms: number) {
  return `${(ms / 3600000).toFixed(1)} hr`;
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

function estimateJob({
  job,
  sessions,
  inventory,
  settings,
  now,
}: {
  job: Job;
  sessions: Session[];
  inventory: InventoryItem[];
  settings: Settings | null;
  now: Date;
}) {
  const jobSessions = sessions.filter((session) => session.jobId === job.id);
  const totalMs = jobSessions.reduce((sum, session) => sum + sessionMs(session, now), 0);
  const labor = { ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) };
  const materialTotals = jobSessions.reduce(
    (sum, session) => {
      const totals = materialTotalsForSession(session, inventory, labor);
      return {
        cost: sum.cost + totals.cost,
        revenue: sum.revenue + totals.revenue,
        expense: sum.expense + totals.expense + extraExpenseTotal(session),
      };
    },
    { cost: 0, revenue: 0, expense: 0 }
  );
  const expenses = materialTotals.expense;

  if (!labor.enabled) {
    return {
      totalMs,
      expenses,
      grossPay: job.billingEstimate?.grossPay ?? null,
      netPay: job.billingEstimate?.netPay ?? null,
      activeSession: jobSessions.find((session) => session.active),
      sessionCount: jobSessions.length,
    };
  }

  const billableHours = roundedBillableHours(totalMs / 3600000, labor.minimumHours, labor.billingIncrementMinutes);
  const laborRevenue = billableHours * labor.hourlyRate;
  const taxableSubtotal = laborRevenue + materialTotals.revenue;
  const taxTotal = taxableSubtotal * (labor.taxPercent / 100);
  const grossPay = taxableSubtotal + taxTotal;

  return {
    totalMs,
    expenses,
    grossPay,
    netPay: grossPay - expenses,
    activeSession: jobSessions.find((session) => session.active),
    sessionCount: jobSessions.length,
  };
}

export default function JobsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("active");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [jobType, setJobType] = useState("");
  const [stage, setStage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);

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

      setSettings(loadJSON<Settings | null>(KEYS.settings, null));
      setJobs(normalizeJobs(loadJSON<unknown>(KEYS.jobs, [])));
      setSessions(normalizeSessions(loadJSON<unknown>(KEYS.sessions, [])));
      setInventory(normalizeInventory(loadJSON<unknown>(KEYS.inventory, { items: [] })));
    }, 0);
    return () => window.clearTimeout(id);
  }, [ready, router]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [ready]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .map((job) => ({ job, estimate: estimateJob({ job, sessions, inventory, settings, now }) }))
      .filter(({ job }) => {
        if (view === "active" && job.status === "done") return false;
        if (view === "completed" && job.status !== "done") return false;
        if (!q) return true;
        return `${titleFor(job)} ${job.customerName ?? ""} ${job.customer ?? ""} ${vehicleFor(job)} ${vinFor(job)} ${job.type ?? ""} ${job.stage ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.estimate.activeSession && !b.estimate.activeSession) return -1;
        if (!a.estimate.activeSession && b.estimate.activeSession) return 1;
        return new Date(b.job.createdAt || b.job.createdAtISO || 0).getTime() - new Date(a.job.createdAt || a.job.createdAtISO || 0).getTime();
      });
  }, [inventory, jobs, now, query, sessions, settings, view]);

  const activeJobs = jobs.filter((job) => job.status !== "done").length;
  const completedJobs = jobs.filter((job) => job.status === "done").length;
  const runningJobs = jobs.filter((job) => sessions.some((session) => session.jobId === job.id && session.active)).length;
  const totals = jobs.reduce(
    (sum, job) => {
      const estimate = estimateJob({ job, sessions, inventory, settings, now });
      return {
        gross: sum.gross + Number(estimate.grossPay ?? 0),
        expenses: sum.expenses + estimate.expenses,
        net: sum.net + Number(estimate.netPay ?? 0),
        ms: sum.ms + estimate.totalMs,
      };
    },
    { gross: 0, expenses: 0, net: 0, ms: 0 }
  );

  const saveJobs = (next: Job[]) => {
    setJobs(next);
    saveJSON(KEYS.jobs, next);
  };

  const deleteJob = (job: Job) => {
    const nextJobs = jobs.filter((item) => item.id !== job.id);
    const nextSessions = sessions.filter((session) => session.jobId !== job.id);
    const nextInvoices = asList<unknown>(loadJSON<unknown>(INVOICES_KEY, []), "invoices").filter((invoice) => !invoiceMatchesJob(invoice, job.id));
    const photoSheets = loadJSON<Record<string, unknown>>(PHOTO_SHEETS_KEY, {});
    if (isRecord(photoSheets)) {
      delete photoSheets[job.id];
      saveJSON(PHOTO_SHEETS_KEY, photoSheets);
    }

    setJobs(nextJobs);
    setSessions(nextSessions);
    saveJSON(KEYS.jobs, nextJobs);
    saveJSON(KEYS.sessions, nextSessions);
    saveJSON(INVOICES_KEY, nextInvoices);
    setDeleteTarget(null);
  };

  const deleteTargetInvoiceCount = deleteTarget
    ? asList<unknown>(loadJSON<unknown>(INVOICES_KEY, []), "invoices").filter((invoice) => invoiceMatchesJob(invoice, deleteTarget.id)).length
    : 0;

  const createJob = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const createdAt = new Date().toISOString();
    const job: Job = {
      id: uid(),
      title: cleanTitle,
      name: cleanTitle,
      customer: customer.trim() || undefined,
      customerName: customer.trim() || undefined,
      vehicle: vehicle.trim() || undefined,
      type: jobType.trim() || undefined,
      stage: stage.trim() || undefined,
      status: "active",
      createdAt,
      createdAtISO: createdAt,
    };
    saveJobs([job, ...jobs]);
    setTitle("");
    setCustomer("");
    setVehicle("");
    setJobType("");
    setStage("");
    router.push("/clock-in");
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">JOBS DASHBOARD</div>
          <h1>{settings?.shop?.name ?? "MARshall OS"}</h1>
          <p>Track active work, session totals, materials spent, and invoice-ready estimates.</p>
        </div>
        <div className="topActions">
          <Link className="btn primary" href="/clock-in">Clock In</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
          <Link className="btn ghost" href="/settings">Settings</Link>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Active jobs" value={String(activeJobs)} />
        <Metric label="Running now" value={String(runningJobs)} tone={runningJobs ? "live" : "normal"} />
        <Metric label="Completed" value={String(completedJobs)} />
        <Metric label="Gross estimate" value={settings?.billing?.labor?.enabled ? money(totals.gross) : "N/A"} />
        <Metric label="Expenses" value={money(totals.expenses)} />
        <Metric label="Net estimate" value={settings?.billing?.labor?.enabled ? money(totals.net) : "N/A"} />
      </section>

      <section className="layout">
        <div className="mainPanel">
          <div className="listTools">
            <div>
              <div className="panelTitle">Job Board</div>
              <div className="panelText">{rows.length} job(s) shown · {msToHours(totals.ms)} logged</div>
            </div>
            <div className="filters">
              {(["active", "completed", "all"] as ViewMode[]).map((item) => (
                <button key={item} className={`seg ${view === item ? "on" : ""}`} onClick={() => setView(item)}>
                  {item === "completed" ? "Completed" : item === "active" ? "Active" : "All"}
                </button>
              ))}
            </div>
            <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs, customers, vehicles..." />
          </div>

          <div className="jobList">
            {rows.map(({ job, estimate }) => (
              <article className={`jobCard ${estimate.activeSession ? "running" : ""}`} key={job.id}>
                <div className="jobMain">
                  <div className="jobTop">
                    <div>
                      <div className="badges">
                        <span className={job.status === "done" ? "badge done" : "badge active"}>{job.status === "done" ? "Done" : "Active"}</span>
                        {estimate.activeSession && <span className="badge live">Running</span>}
                        {job.invoiceReady && <span className="badge invoice">Invoice ready</span>}
                      </div>
                      <h2>{titleFor(job)}</h2>
                    </div>
                    <div className="jobMoney">
                      <strong>{estimate.grossPay === null ? "N/A" : money(estimate.grossPay)}</strong>
                      <span>gross estimate</span>
                    </div>
                  </div>

                  <div className="metaGrid">
                    <Info label="Customer" value={job.customerName || job.customer || "No customer"} />
                    <Info label="Vehicle" value={vehicleFor(job) || "No vehicle"} />
                    <Info label="Job type" value={job.type || "General"} />
                    <Info label="Stage" value={job.stage || "Not set"} />
                  </div>

                  <div className="financeGrid">
                    <MiniStat label="Total time" value={msToHours(estimate.totalMs)} />
                    <MiniStat label="Sessions" value={String(estimate.sessionCount)} />
                    <MiniStat label="Expenses" value={money(estimate.expenses)} />
                    <MiniStat label="Net" value={estimate.netPay === null ? "N/A" : money(estimate.netPay)} />
                  </div>
                </div>

                <div className="jobSide">
                  <div className="sideLine">
                    <span>Created</span>
                    <strong>{shortDate(job.createdAt || job.createdAtISO)}</strong>
                  </div>
                  {vinFor(job) && (
                    <div className="sideLine">
                      <span>VIN</span>
                      <strong>{vinFor(job)}</strong>
                    </div>
                  )}
                  <div className="cardActions">
                    {estimate.activeSession ? (
                      <Link className="btn primary" href={`/session/${estimate.activeSession.id}`}>Open Session</Link>
                    ) : job.status !== "done" ? (
                      <Link className="btn primary" href="/clock-in">Start Session</Link>
                    ) : null}
                    <Link className="btn ghost" href={`/jobs/${job.id}`}>Details</Link>
                    <button className="btn danger" onClick={() => setDeleteTarget(job)}>Delete Job</button>
                  </div>
                </div>
              </article>
            ))}
            {rows.length === 0 && <div className="empty">No jobs match this view.</div>}
          </div>
        </div>

        <aside className="sidePanel">
          <div className="panelTitle">Create Job</div>
          <div className="panelText">Quick-create a folder, then clock in when you are ready to start work.</div>
          <label className="label">Job title
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="F-250 cab + doors" />
          </label>
          <label className="label">Customer
            <input className="input" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Customer or business" />
          </label>
          <label className="label">Vehicle
            <input className="input" value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="2002 Ford F-250" />
          </label>
          <div className="two">
            <label className="label">Type
              <input className="input" value={jobType} onChange={(event) => setJobType(event.target.value)} placeholder="Repaint" />
            </label>
            <label className="label">Stage
              <input className="input" value={stage} onChange={(event) => setStage(event.target.value)} placeholder="Intake" />
            </label>
          </div>
          <button className="btn primary fullBtn" onClick={createJob}>Create Job</button>
        </aside>
      </section>

      {deleteTarget && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Confirm job delete">
          <div className="modal">
            <div>
              <div className="panelTitle">Confirm job deletion</div>
              <p>
                This will permanently delete "{titleFor(deleteTarget)}", all sessions for this job,
                the job photo sheet, and {deleteTargetInvoiceCount} linked invoice{deleteTargetInvoiceCount === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="modalActions">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn danger" onClick={() => deleteJob(deleteTarget)}>Delete Job</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "live" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .metrics, .layout { width: min(1260px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; backdrop-filter: blur(10px); box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  h2 { margin: 8px 0 0; font-size: 24px; line-height: 1.05; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .filters, .cardActions { display: flex; gap: 10px; flex-wrap: wrap; }
  .btn, .seg { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
  .metric { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.38); border-radius: 10px; padding: 14px; display: grid; gap: 4px; backdrop-filter: blur(8px); }
  .metric.live { border-color: rgba(150,220,255,.32); background: rgba(120,200,255,.1); }
  .metric span, .mini span, .info span, .sideLine span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .65; font-weight: 900; }
  .metric strong { font-size: 26px; line-height: 1; white-space: nowrap; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .36fr); gap: 14px; align-items: start; }
  .mainPanel, .sidePanel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 16px; display: grid; gap: 14px; backdrop-filter: blur(10px); }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .listTools { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(220px,.34fr); gap: 12px; align-items: end; }
  .seg { padding: 9px 11px; font-size: 12px; }
  .seg.on { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.34); }
  .search, .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .jobList { display: grid; gap: 12px; }
  .jobCard { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 12px; padding: 14px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(210px, .24fr); gap: 14px; }
  .jobCard.running { border-color: rgba(150,220,255,.3); background: rgba(120,200,255,.08); }
  .jobMain { min-width: 0; display: grid; gap: 12px; }
  .jobTop { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .badges { display: flex; flex-wrap: wrap; gap: 7px; }
  .badge { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 6px 8px; font-size: 11px; font-weight: 950; }
  .badge.live { border-color: rgba(150,220,255,.35); background: rgba(120,200,255,.14); }
  .badge.done, .badge.invoice { opacity: .78; }
  .jobMoney { text-align: right; display: grid; gap: 3px; }
  .jobMoney strong { font-size: 22px; white-space: nowrap; }
  .jobMoney span { opacity: .65; font-size: 12px; }
  .metaGrid, .financeGrid, .two { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .financeGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .info, .mini, .sideLine { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); border-radius: 10px; padding: 10px; display: grid; gap: 5px; min-width: 0; }
  .info strong, .mini strong, .sideLine strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .jobSide { display: grid; gap: 9px; align-content: start; }
  .cardActions { display: grid; }
  .sidePanel { position: sticky; top: 14px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .two { grid-template-columns: 1fr 1fr; }
  .fullBtn { width: 100%; }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); }
  .modalShade { position: fixed; inset: 0; background: rgba(0,0,0,.64); display: grid; place-items: center; padding: 18px; z-index: 20; }
  .modal { width: min(520px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .modalActions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  @media (max-width: 1080px) { .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } .layout, .listTools, .jobCard { grid-template-columns: 1fr; } .sidePanel { position: static; } .metaGrid, .financeGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } .jobMoney { text-align: left; } }
  @media (max-width: 680px) { .wrap { padding: 12px; } .topbar { display: grid; } .topActions, .filters, .cardActions, .modalActions { justify-content: stretch; } .btn, .seg { flex: 1 1 auto; } .metrics, .metaGrid, .financeGrid, .two { grid-template-columns: 1fr; } h1 { font-size: 38px; } }
`;
