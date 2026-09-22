"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";
import type { Settings } from "@/lib/setupData";

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
  customer?: string;
  customerName?: string;
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string };
  vin?: string;
  status?: "active" | "done";
  completedAt?: string;
  invoiceReady?: boolean;
  billingEstimate?: BillingEstimate;
};

type Invoice = {
  id: string;
  jobId: string;
  jobIds: string[];
  invoiceNumber: string;
  status: "draft" | "sent" | "paid";
  customer?: string;
  vehicle?: string;
  total: number;
  updatedAt: string;
};

const INVOICES_KEY = "marshall_invoices_v1";
const ESTIMATE_KEY = "marshall_estimate_builder_v1";
type BillingTab = "estimate" | "ready" | "draft" | "sent" | "paid" | "notReady";

type EstimateDraft = {
  customer: string;
  vehicle: string;
  description: string;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  partsCost: number;
  extraCost: number;
  taxPercent: number;
  notes: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key] as T[];
  if (isRecord(raw) && Array.isArray(raw.jobs)) return raw.jobs as T[];
  if (isRecord(raw) && Array.isArray(raw.invoices)) return raw.invoices as T[];
  return [];
}

function normalizeJobs(raw: unknown): Job[] {
  return asList<Record<string, unknown>>(raw, "jobs").filter(isRecord).map((job) => ({
    id: String(job.id ?? ""),
    title: typeof job.title === "string" ? job.title : typeof job.name === "string" ? job.name : "Untitled job",
    name: typeof job.name === "string" ? job.name : typeof job.title === "string" ? job.title : "Untitled job",
    customer: typeof job.customer === "string" ? job.customer : undefined,
    customerName: typeof job.customerName === "string" ? job.customerName : typeof job.customer === "string" ? job.customer : undefined,
    vehicle: typeof job.vehicle === "string" || isRecord(job.vehicle) ? (job.vehicle as Job["vehicle"]) : undefined,
    vin: typeof job.vin === "string" ? job.vin : undefined,
    status: job.status === "done" ? "done" as const : "active" as const,
    completedAt: typeof job.completedAt === "string" ? job.completedAt : undefined,
    invoiceReady: Boolean(job.invoiceReady),
    billingEstimate: isRecord(job.billingEstimate) ? job.billingEstimate as BillingEstimate : undefined,
  })).filter((job) => job.id);
}

function normalizeInvoices(raw: unknown): Invoice[] {
  return asList<Record<string, unknown>>(raw, "invoices").filter(isRecord).map((invoice) => {
    const jobIds = Array.isArray(invoice.jobIds)
      ? invoice.jobIds.map((id) => String(id)).filter(Boolean)
      : [];
    const jobId = String(invoice.jobId ?? jobIds[0] ?? "");
    return {
      id: String(invoice.id ?? ""),
      jobId,
      jobIds: jobIds.length ? jobIds : jobId ? [jobId] : [],
      invoiceNumber: String(invoice.invoiceNumber ?? ""),
      status: invoice.status === "paid" ? "paid" as const : invoice.status === "sent" ? "sent" as const : "draft" as const,
      customer: typeof invoice.customer === "string" ? invoice.customer : undefined,
      vehicle: typeof invoice.vehicle === "string" ? invoice.vehicle : undefined,
      total: Number.isFinite(Number(invoice.total)) ? Number(invoice.total) : 0,
      updatedAt: typeof invoice.updatedAt === "string" ? invoice.updatedAt : "",
    };
  }).filter((invoice) => invoice.id && invoice.jobIds.length);
}

function titleFor(job: Job) {
  return job.title || job.name || "Untitled job";
}

function vehicleFor(job: Job) {
  if (!job.vehicle) return "No vehicle";
  if (typeof job.vehicle === "string") return job.vehicle;
  return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ") || "No vehicle";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function shortDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function invoiceForJob(invoices: Invoice[], jobId: string) {
  return invoices.find((invoice) => invoice.jobId === jobId || invoice.jobIds.includes(jobId));
}

function makeInvoiceNumber(existing: Invoice[]) {
  return `INV-${String(existing.length + 1).padStart(4, "0")}`;
}

function blankEstimate(): EstimateDraft {
  return {
    customer: "",
    vehicle: "",
    description: "",
    laborHours: 0,
    laborRate: 0,
    materialCost: 0,
    partsCost: 0,
    extraCost: 0,
    taxPercent: 0,
    notes: "",
  };
}

function normalizeEstimate(raw: unknown): EstimateDraft {
  const source = isRecord(raw) ? raw : {};
  return {
    customer: String(source.customer ?? ""),
    vehicle: String(source.vehicle ?? ""),
    description: String(source.description ?? ""),
    laborHours: Number.isFinite(Number(source.laborHours)) ? Number(source.laborHours) : 0,
    laborRate: Number.isFinite(Number(source.laborRate)) ? Number(source.laborRate) : 0,
    materialCost: Number.isFinite(Number(source.materialCost)) ? Number(source.materialCost) : 0,
    partsCost: Number.isFinite(Number(source.partsCost)) ? Number(source.partsCost) : 0,
    extraCost: Number.isFinite(Number(source.extraCost)) ? Number(source.extraCost) : 0,
    taxPercent: Number.isFinite(Number(source.taxPercent)) ? Number(source.taxPercent) : 0,
    notes: String(source.notes ?? ""),
  };
}

export default function BillingPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<BillingTab>("ready");
  const [notReadyMessage, setNotReadyMessage] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<EstimateDraft>(() => blankEstimate());
  const [estimateSavedAt, setEstimateSavedAt] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loadedSettings = loadJSON<Settings | null>(KEYS.settings, null);
      const savedEstimate = normalizeEstimate(loadJSON<unknown>(ESTIMATE_KEY, blankEstimate()));
      setJobs(normalizeJobs(loadJSON<unknown>(KEYS.jobs, [])));
      setInvoices(normalizeInvoices(loadJSON<unknown>(INVOICES_KEY, [])));
      setSettings(loadedSettings);
      setEstimate({
        ...savedEstimate,
        laborRate: savedEstimate.laborRate || Number(loadedSettings?.billing?.labor?.hourlyRate ?? 0),
        taxPercent: savedEstimate.taxPercent || Number(loadedSettings?.billing?.labor?.taxPercent ?? 0),
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const searchedJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((job) => !q || `${titleFor(job)} ${job.customerName ?? ""} ${job.customer ?? ""} ${vehicleFor(job)}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  }, [jobs, query]);

  const readyJobs = searchedJobs.filter((job) => job.status === "done" && job.invoiceReady && !invoiceForJob(invoices, job.id));
  const notReadyJobs = searchedJobs.filter((job) => !invoiceForJob(invoices, job.id) && (job.status !== "done" || !job.invoiceReady));
  const searchedInvoices = invoices
    .filter((invoice) => {
      const q = query.trim().toLowerCase();
      const linkedJobs = jobs.filter((job) => invoice.jobIds.includes(job.id));
      const haystack = `${invoice.invoiceNumber} ${invoice.customer ?? ""} ${invoice.vehicle ?? ""} ${linkedJobs.map((job) => `${titleFor(job)} ${job.customerName ?? ""} ${job.customer ?? ""} ${vehicleFor(job)}`).join(" ")}`.toLowerCase();
      return !q || haystack.includes(q);
    })
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const draftInvoices = searchedInvoices.filter((invoice) => invoice.status === "draft");
  const sentInvoices = searchedInvoices.filter((invoice) => invoice.status === "sent");
  const paidInvoices = searchedInvoices.filter((invoice) => invoice.status === "paid");
  const allDraftCount = invoices.filter((invoice) => invoice.status === "draft").length;
  const allSentCount = invoices.filter((invoice) => invoice.status === "sent").length;
  const allPaidCount = invoices.filter((invoice) => invoice.status === "paid").length;
  const allReadyCount = jobs.filter((job) => job.status === "done" && job.invoiceReady && !invoiceForJob(invoices, job.id)).length;
  const paidTotal = invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const selectedJobs = readyJobs.filter((job) => selectedJobIds.includes(job.id));
  const estimateLabor = estimate.laborHours * estimate.laborRate;
  const estimateMaterials = estimate.materialCost + estimate.partsCost + estimate.extraCost;
  const estimateSubtotal = estimateLabor + estimateMaterials;
  const estimateTax = estimateSubtotal * estimate.taxPercent / 100;
  const estimateTotal = estimateSubtotal + estimateTax;

  const tabs: { id: BillingTab; label: string; count: number }[] = [
    { id: "estimate", label: "Estimate", count: 0 },
    { id: "ready", label: "Ready for invoice", count: readyJobs.length },
    { id: "draft", label: "Draft", count: draftInvoices.length },
    { id: "sent", label: "Sent", count: sentInvoices.length },
    { id: "paid", label: "Paid", count: paidInvoices.length },
    { id: "notReady", label: "Not ready", count: notReadyJobs.length },
  ];

  const toggleJob = (jobId: string) => {
    setSelectedJobIds((current) => current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]);
  };

  const createCombinedInvoice = () => {
    const ids = selectedJobs.map((job) => job.id);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      router.push(`/billing/${ids[0]}`);
      return;
    }
    const primaryJob = selectedJobs[0];
    const now = new Date().toISOString();
    const nextInvoice = {
      id: uid(),
      jobId: ids[0],
      jobIds: ids,
      invoiceNumber: makeInvoiceNumber(invoices),
      status: "draft" as const,
      customer: primaryJob?.customerName || primaryJob?.customer || "Combined invoice",
      vehicle: "Multiple jobs",
      notes: "Thank you for your business.",
      lines: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
    };
    const nextInvoices = [nextInvoice, ...invoices];
    saveJSON(INVOICES_KEY, nextInvoices);
    setInvoices(nextInvoices);
    router.push(`/billing/${nextInvoice.id}`);
  };

  const deleteInvoice = (invoice: Invoice) => {
    const nextInvoices = invoices.filter((item) => item.id !== invoice.id);
    setInvoices(nextInvoices);
    saveJSON(INVOICES_KEY, nextInvoices);
    setDeleteTarget(null);
  };

  const updateEstimate = (patch: Partial<EstimateDraft>) => {
    setEstimate((current) => ({ ...current, ...patch }));
    setEstimateSavedAt("");
  };

  const saveEstimate = () => {
    saveJSON(ESTIMATE_KEY, estimate);
    setEstimateSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">BILLING</div>
          <h1>{settings?.shop?.name ?? "MARshall OS"}</h1>
          <p>Completed jobs land here when they are ready to become invoices.</p>
        </div>
        <div className="topActions">
          <Link className="btn ghost" href="/jobs">Jobs</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Invoice ready" value={String(allReadyCount)} />
        <Metric label="Draft" value={String(allDraftCount)} />
        <Metric label="Sent" value={String(allSentCount)} />
        <Metric label="Paid" value={String(allPaidCount)} />
        <Metric label="Total made" value={money(paidTotal)} />
      </section>

      <section className="panel">
        <div className="tools">
          <div>
            <div className="panelTitle">{tabs.find((tab) => tab.id === activeTab)?.label}</div>
            <div className="panelText">Sort jobs and invoices by where they are in the billing flow.</div>
          </div>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, job, vehicle..." />
        </div>

        <div className="tabs" role="tablist" aria-label="Billing status tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={`tab ${activeTab === tab.id ? "on" : ""}`} onClick={() => {
              setActiveTab(tab.id);
              setSelectedJobIds([]);
            }}>
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>

        {activeTab === "ready" && (
          <div className="combineBar">
            <div>
              <strong>{selectedJobIds.length} selected</strong>
              <span>Select finished jobs to bundle into one invoice.</span>
            </div>
            <button className="btn primary" disabled={selectedJobIds.length === 0} onClick={createCombinedInvoice}>
              {selectedJobIds.length > 1 ? "Create Combined Invoice" : "Open Selected Invoice"}
            </button>
          </div>
        )}

        <div className="jobList">
          {activeTab === "estimate" && (
            <EstimateBuilder
              estimate={estimate}
              laborTotal={estimateLabor}
              materialsTotal={estimateMaterials}
              subtotal={estimateSubtotal}
              tax={estimateTax}
              total={estimateTotal}
              savedAt={estimateSavedAt}
              onChange={updateEstimate}
              onSave={saveEstimate}
              onReset={() => {
                setEstimate(blankEstimate());
                setEstimateSavedAt("");
              }}
            />
          )}
          {activeTab === "ready" && readyJobs.map((job) => (
            <JobCard key={job.id} job={job} selected={selectedJobIds.includes(job.id)} onToggle={() => toggleJob(job.id)} />
          ))}
          {activeTab === "draft" && draftInvoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} jobs={jobs} onDelete={setDeleteTarget} />)}
          {activeTab === "sent" && sentInvoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} jobs={jobs} onDelete={setDeleteTarget} />)}
          {activeTab === "paid" && paidInvoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} jobs={jobs} onDelete={setDeleteTarget} />)}
          {activeTab === "notReady" && notReadyJobs.map((job) => (
            <NotReadyJobCard key={job.id} job={job} onBlocked={() => setNotReadyMessage("Finish job before making invoice")} />
          ))}
          {activeTab === "ready" && readyJobs.length === 0 && <div className="empty">No completed jobs are waiting for a new invoice.</div>}
          {activeTab === "draft" && draftInvoices.length === 0 && <div className="empty">No draft invoices match this search.</div>}
          {activeTab === "sent" && sentInvoices.length === 0 && <div className="empty">No sent invoices match this search.</div>}
          {activeTab === "paid" && paidInvoices.length === 0 && <div className="empty">No paid invoices match this search.</div>}
          {activeTab === "notReady" && notReadyJobs.length === 0 && <div className="empty">No not-ready jobs match this search.</div>}
        </div>
      </section>

      {notReadyMessage && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Invoice unavailable">
          <div className="modal">
            <div className="panelTitle">{notReadyMessage}</div>
            <p>Save and end the job from the session review before making an invoice.</p>
            <div className="modalActions">
              <button className="btn primary" onClick={() => setNotReadyMessage("")}>Okay</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Confirm invoice delete">
          <div className="modal">
            <div>
              <div className="panelTitle">Confirm invoice deletion</div>
              <p>
                This will permanently delete {deleteTarget.invoiceNumber || "this invoice"}.
                The linked job stays in the job list.
              </p>
            </div>
            <div className="modalActions">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn danger" onClick={() => deleteInvoice(deleteTarget)}>Delete Invoice</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function EstimateBuilder({
  estimate,
  laborTotal,
  materialsTotal,
  subtotal,
  tax,
  total,
  savedAt,
  onChange,
  onSave,
  onReset,
}: {
  estimate: EstimateDraft;
  laborTotal: number;
  materialsTotal: number;
  subtotal: number;
  tax: number;
  total: number;
  savedAt: string;
  onChange: (patch: Partial<EstimateDraft>) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <section className="estimateBuilder">
      <div className="estimateHeader">
        <div>
          <div className="panelTitle">Quick Estimate</div>
          <div className="panelText">A simple faux invoice for rough labor, inventory, parts, and tax.</div>
        </div>
        {savedAt && <span className="savedPill">Saved at {savedAt}</span>}
      </div>

      <div className="estimateGrid">
        <label className="label">Customer
          <input className="input" value={estimate.customer} onChange={(event) => onChange({ customer: event.target.value })} placeholder="Customer name" />
        </label>
        <label className="label">Vehicle / job
          <input className="input" value={estimate.vehicle} onChange={(event) => onChange({ vehicle: event.target.value })} placeholder="1966 Ford F-100" />
        </label>
        <label className="label full">Description
          <input className="input" value={estimate.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Body work, primer, paint, materials..." />
        </label>
        <label className="label">Labor hours
          <DecimalInput className="input" value={estimate.laborHours} onValueChange={(value) => onChange({ laborHours: value })} />
        </label>
        <label className="label">Labor rate
          <DecimalInput className="input" value={estimate.laborRate} onValueChange={(value) => onChange({ laborRate: value })} />
        </label>
        <label className="label">Inventory / materials
          <DecimalInput className="input" value={estimate.materialCost} onValueChange={(value) => onChange({ materialCost: value })} />
        </label>
        <label className="label">Parts
          <DecimalInput className="input" value={estimate.partsCost} onValueChange={(value) => onChange({ partsCost: value })} />
        </label>
        <label className="label">Extra / shop supplies
          <DecimalInput className="input" value={estimate.extraCost} onValueChange={(value) => onChange({ extraCost: value })} />
        </label>
        <label className="label">Tax percent
          <DecimalInput className="input" value={estimate.taxPercent} onValueChange={(value) => onChange({ taxPercent: value })} />
        </label>
        <label className="label full">Notes
          <textarea className="input notes" value={estimate.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Estimate assumptions, exclusions, timeline, deposit note..." />
        </label>
      </div>

      <div className="estimateSummary">
        <MoneyRow label="Labor" value={money(laborTotal)} />
        <MoneyRow label="Inventory / parts / extras" value={money(materialsTotal)} />
        <MoneyRow label="Subtotal" value={money(subtotal)} />
        <MoneyRow label={`Tax (${estimate.taxPercent || 0}%)`} value={money(tax)} />
        <MoneyRow label="Estimated total" value={money(total)} strong />
      </div>

      <div className="estimateActions">
        <button className="btn ghost" onClick={onReset}>Reset</button>
        <button className="btn primary" onClick={onSave}>Save Estimate</button>
      </div>
    </section>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`moneyRow ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function JobCard({ job, selected, onToggle }: { job: Job; selected: boolean; onToggle: () => void }) {
  return (
    <article className="jobCard">
      <label className="selectBox" title="Select for invoice">
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span />
      </label>
      <div>
        <div className="badges">
          <span className="badge">Finished</span>
          <span className="badge">Invoice ready</span>
        </div>
        <h2>{titleFor(job)}</h2>
        <p>{job.customerName || job.customer || "No customer"} · {vehicleFor(job)} · Completed {shortDate(job.completedAt)}</p>
      </div>
      <div className="moneyBox">
        <span>Estimate</span>
        <strong>{money(job.billingEstimate?.grossPay ?? 0)}</strong>
      </div>
      <div className="invoiceBox">
        <span>Invoice</span>
        <strong>Not drafted</strong>
        <small>Ready to create</small>
      </div>
      <div className="cardActions">
        <Link className="btn primary" href={`/billing/${job.id}`}>Make Invoice</Link>
        <Link className="btn ghost" href={`/jobs/${job.id}`}>Job Detail</Link>
      </div>
    </article>
  );
}

function InvoiceCard({ invoice, jobs, onDelete }: { invoice: Invoice; jobs: Job[]; onDelete: (invoice: Invoice) => void }) {
  const linkedJobs = jobs.filter((job) => invoice.jobIds.includes(job.id));
  const primaryJob = linkedJobs[0];
  return (
    <article className="jobCard invoiceCard">
      <div className="invoiceIcon">{invoice.status}</div>
      <div>
        <div className="badges">
          <span className={`badge ${invoice.status}`}>{invoice.status}</span>
          <span className="badge">{invoice.jobIds.length} job{invoice.jobIds.length === 1 ? "" : "s"}</span>
        </div>
        <h2>{invoice.invoiceNumber || "Invoice"}</h2>
        <p>{invoice.customer || primaryJob?.customerName || primaryJob?.customer || "No customer"} · {invoice.vehicle || (primaryJob ? vehicleFor(primaryJob) : "No vehicle")} · Updated {shortDate(invoice.updatedAt)}</p>
      </div>
      <div className="moneyBox">
        <span>Total</span>
        <strong>{money(invoice.total)}</strong>
      </div>
      <div className="invoiceBox">
        <span>Jobs</span>
        <strong>{linkedJobs.length ? linkedJobs.map(titleFor).join(" + ") : "Linked jobs"}</strong>
        <small>{invoice.status}</small>
      </div>
      <div className="cardActions">
        <Link className="btn primary" href={`/billing/${invoice.id}`}>Open Invoice</Link>
        {primaryJob && <Link className="btn ghost" href={`/jobs/${primaryJob.id}`}>Job Detail</Link>}
        <button className="btn danger" onClick={() => onDelete(invoice)}>Delete Invoice</button>
      </div>
    </article>
  );
}

function NotReadyJobCard({ job, onBlocked }: { job: Job; onBlocked: () => void }) {
  const isFinished = job.status === "done";
  return (
    <article className="jobCard notReadyCard">
      <div className="invoiceIcon muted">wait</div>
      <div>
        <div className="badges">
          <span className="badge muted">{isFinished ? "Finished" : "Active"}</span>
          <span className="badge muted">{job.invoiceReady ? "Invoice flag set" : "Not invoice-ready"}</span>
        </div>
        <h2>{titleFor(job)}</h2>
        <p>{job.customerName || job.customer || "No customer"} · {vehicleFor(job)} · {isFinished ? `Completed ${shortDate(job.completedAt)}` : "Still active"}</p>
      </div>
      <div className="moneyBox">
        <span>Estimate</span>
        <strong>{money(job.billingEstimate?.grossPay ?? 0)}</strong>
      </div>
      <div className="invoiceBox">
        <span>Invoice</span>
        <strong>Unavailable</strong>
        <small>{isFinished ? "Review has not marked it ready" : "Finish job first"}</small>
      </div>
      <div className="cardActions">
        <button className="btn disabledBtn" onClick={onBlocked}>Make Invoice</button>
        <Link className="btn ghost" href={`/jobs/${job.id}`}>Job Detail</Link>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .metrics, .panel { width: min(1180px, 100%); margin: 0 auto; }
  .topbar, .panel, .metric, .jobCard { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; backdrop-filter: blur(10px); }
  .topbar { padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  h2 { margin: 8px 0 0; font-size: 24px; line-height: 1.05; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .cardActions, .badges { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .btn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .metrics { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; }
  .metric { padding: 14px; display: grid; gap: 4px; }
  .metric span, .moneyBox span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .metric strong { font-size: 28px; line-height: 1; }
  .panel { padding: 16px; display: grid; gap: 14px; }
  .tools { display: grid; grid-template-columns: minmax(0,1fr) minmax(260px,.36fr); gap: 12px; align-items: end; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .combineBar { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 12px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .combineBar div { display: grid; gap: 3px; }
  .combineBar span, .invoiceBox small { color: rgba(238,241,243,.68); font-size: 12px; }
  .tabs { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 8px; }
  .tab { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.045); color: #eef1f3; border-radius: 12px; padding: 10px; cursor: pointer; display: flex; justify-content: space-between; gap: 10px; align-items: center; text-align: left; }
  .tab span { font-size: 12px; font-weight: 950; line-height: 1.15; }
  .tab strong { min-width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: rgba(0,0,0,.28); font-size: 12px; }
  .tab.on { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.3); }
  .jobList { display: grid; gap: 12px; }
  .estimateBuilder { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 14px; padding: 14px; display: grid; gap: 14px; }
  .estimateHeader { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
  .savedPill { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 950; white-space: nowrap; }
  .estimateGrid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .full { grid-column: 1 / -1; }
  .notes { min-height: 86px; resize: vertical; font-family: inherit; }
  .estimateSummary { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); border-radius: 12px; padding: 12px; display: grid; gap: 8px; }
  .moneyRow { display: flex; justify-content: space-between; gap: 12px; color: rgba(238,241,243,.78); }
  .moneyRow.strong { border-top: 1px solid rgba(255,255,255,.1); padding-top: 10px; color: #eef1f3; font-size: 20px; }
  .estimateActions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  .jobCard { padding: 14px; display: grid; grid-template-columns: 38px minmax(0,1fr) minmax(150px,.18fr) minmax(170px,.2fr) auto; gap: 14px; align-items: center; background: rgba(255,255,255,.055); }
  .notReadyCard { opacity: .78; }
  .invoiceIcon { width: 38px; min-height: 38px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.075); border-radius: 10px; display: grid; place-items: center; font-size: 10px; font-weight: 1000; text-transform: uppercase; color: rgba(238,241,243,.75); }
  .invoiceIcon.muted { color: rgba(238,241,243,.54); background: rgba(0,0,0,.22); }
  .selectBox { width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer; }
  .selectBox input { position: absolute; opacity: 0; pointer-events: none; }
  .selectBox span { width: 24px; height: 24px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.24); display: block; }
  .selectBox input:checked + span { background: rgba(255,255,255,.78); box-shadow: inset 0 0 0 6px rgba(0,0,0,.55); }
  .badge { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 6px 8px; font-size: 11px; font-weight: 950; text-transform: uppercase; }
  .badge.draft, .badge.sent { border-color: rgba(150,220,255,.34); background: rgba(120,200,255,.1); }
  .badge.paid { border-color: rgba(120,235,165,.36); background: rgba(70,180,115,.18); }
  .badge.muted { opacity: .7; background: rgba(0,0,0,.22); }
  .moneyBox, .invoiceBox { display: grid; gap: 4px; text-align: right; }
  .moneyBox strong { font-size: 24px; white-space: nowrap; }
  .invoiceBox span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .invoiceBox strong { white-space: nowrap; }
  .disabledBtn { opacity: .48; background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.1); }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); }
  .modalShade { position: fixed; inset: 0; background: rgba(0,0,0,.64); display: grid; place-items: center; padding: 18px; z-index: 20; }
  .modal { width: min(440px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 12px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .modalActions { display: flex; justify-content: flex-end; }
  @media (max-width: 900px) { .topbar, .tools, .jobCard, .combineBar, .estimateHeader { display: grid; grid-template-columns: 1fr; } .metrics, .tabs, .estimateGrid { grid-template-columns: 1fr; } .topActions, .cardActions, .modalActions, .estimateActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .moneyBox, .invoiceBox { text-align: left; } }
`;
