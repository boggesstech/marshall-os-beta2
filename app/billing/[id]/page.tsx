"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { photoFileToStorageDataUrl, stripOversizedPhotoDataUrl } from "@/lib/imageStorage";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";
import {
  CUSTOMERS_KEY,
  DEFAULT_LABOR_BILLING,
  blankCustomer,
  blankVehicle,
  type Customer,
  type CustomerVehicle,
  type LaborBillingSettings,
  type MaterialBillingMode,
  type Settings,
} from "@/lib/setupData";

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
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string; plate?: string; paint?: string };
  vin?: string;
  status?: "active" | "done";
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
  stage?: string;
  task?: string;
  usedItems?: UsedItem[];
  extraExpenses?: ExtraExpense[];
  photos?: { id?: string; name?: string; dataUrl?: string; caption?: string; createdAt?: string }[];
  images?: { id?: string; name?: string; dataUrl?: string; createdISO?: string }[];
  photoSheet?: { photos?: { id?: string; sourceId?: string; name?: string; dataUrl?: string; caption?: string; createdAt?: string }[] };
  materialTotal?: number;
};

type InventoryItem = {
  id: string;
  name?: string;
  unit?: string;
  unitPrice?: number;
};

type InvoiceLine = {
  id: string;
  description: string;
  qty: number;
  rate: number;
  taxable: boolean;
  kind: "labor" | "material" | "expense" | "custom";
};

type InvoicePhoto = {
  id: string;
  sourceId?: string;
  name: string;
  dataUrl: string;
  caption: string;
  createdAt: string;
};

type JobPhotoSheet = {
  jobId: string;
  title?: string;
  notes?: string;
  photos?: InvoicePhoto[];
};

type Invoice = {
  id: string;
  jobId: string;
  jobIds: string[];
  invoiceNumber: string;
  status: "draft" | "sent" | "paid";
  customer: string;
  customerBusiness: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  vehicle: string;
  notes: string;
  terms: string;
  dueDate: string;
  businessName: string;
  logoText: string;
  logoDataUrl: string;
  tagline: string;
  accentColor: string;
  includePhotoPage: boolean;
  photoTitle: string;
  photoNotes: string;
  photos: InvoicePhoto[];
  lines: InvoiceLine[];
  taxPercent: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

const INVOICES_KEY = "marshall_invoices_v1";
const PHOTO_SHEETS_KEY = "marshall_job_photo_sheets_v1";
const DEFAULT_TERMS = "Payment due upon receipt unless otherwise agreed.";
const DEFAULT_ACCENT = "#2ca01c";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isBillingMode(value: unknown): value is MaterialBillingMode {
  return value === "none" || value === "percent" || value === "all";
}

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key] as T[];
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items as T[];
  if (isRecord(raw) && Array.isArray(raw.jobs)) return raw.jobs as T[];
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions as T[];
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
    stage: typeof session.stage === "string" ? session.stage : undefined,
    task: typeof session.task === "string" ? session.task : undefined,
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
    photos: Array.isArray(session.photos) ? session.photos as Session["photos"] : [],
    images: Array.isArray(session.images) ? session.images as Session["images"] : [],
    materialTotal: Number.isFinite(Number(session.materialTotal)) ? Number(session.materialTotal) : undefined,
  }));
}

function normalizeInventory(raw: unknown): InventoryItem[] {
  return asList<Record<string, unknown>>(raw, "items").filter(isRecord).map((item) => ({
    id: String(item.id ?? uid()),
    name: typeof item.name === "string" ? item.name : undefined,
    unit: typeof item.unit === "string" ? item.unit : undefined,
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
  }));
}

function normalizeVehicle(raw: Partial<CustomerVehicle> | undefined): CustomerVehicle {
  const blank = blankVehicle();
  return {
    ...blank,
    ...(raw ?? {}),
    id: raw?.id ?? blank.id,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
  };
}

function vehicleHasContent(vehicle: CustomerVehicle) {
  return Boolean(vehicle.make || vehicle.model || vehicle.year || vehicle.paint || vehicle.vin || vehicle.plate || vehicle.notes || vehicle.tags.length);
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

function normalizeCustomers(raw: unknown): Customer[] {
  return asList<Partial<Customer>>(raw, "customers").map(normalizeCustomer);
}

function normalizeInvoices(raw: unknown): Invoice[] {
  return asList<Record<string, unknown>>(raw, "invoices").filter(isRecord).map((invoice) => {
    const jobIds = Array.isArray(invoice.jobIds)
      ? invoice.jobIds.map((id) => String(id)).filter(Boolean)
      : [];
    const jobId = String(invoice.jobId ?? jobIds[0] ?? "");
    const createdAt = String(invoice.createdAt ?? new Date().toISOString());
    const lines = Array.isArray(invoice.lines)
      ? invoice.lines.filter(isRecord).map((line) => {
        const kind = line.kind === "material" ? "material" as const : line.kind === "expense" ? "expense" as const : line.kind === "custom" ? "custom" as const : "labor" as const;
        return {
          id: String(line.id ?? uid()),
          description: String(line.description ?? ""),
          qty: Number.isFinite(Number(line.qty)) ? Number(line.qty) : 1,
          rate: Number.isFinite(Number(line.rate)) ? Number(line.rate) : 0,
          taxable: typeof line.taxable === "boolean" ? line.taxable : kind !== "expense",
          kind,
        };
      })
      : [];
    const taxableSubtotal = lines.reduce((sum, line) => sum + (line.taxable ? line.qty * line.rate : 0), 0);
    const tax = Number.isFinite(Number(invoice.tax)) ? Number(invoice.tax) : 0;
    const photos = Array.isArray(invoice.photos)
      ? invoice.photos.filter(isRecord).map((photo) => ({
        id: String(photo.id ?? uid()),
        sourceId: typeof photo.sourceId === "string" ? photo.sourceId : undefined,
        name: String(photo.name ?? "Photo"),
        dataUrl: String(photo.dataUrl ?? ""),
        caption: String(photo.caption ?? ""),
        createdAt: String(photo.createdAt ?? ""),
      })).filter((photo) => photo.dataUrl || photo.sourceId)
      : [];
    return {
      id: String(invoice.id ?? uid()),
      jobId,
      jobIds: jobIds.length ? jobIds : jobId ? [jobId] : [],
      invoiceNumber: String(invoice.invoiceNumber ?? ""),
      status: invoice.status === "paid" ? "paid" as const : invoice.status === "sent" ? "sent" as const : "draft" as const,
      customer: String(invoice.customer ?? ""),
      customerBusiness: String(invoice.customerBusiness ?? ""),
      customerPhone: String(invoice.customerPhone ?? ""),
      customerEmail: String(invoice.customerEmail ?? ""),
      customerAddress: String(invoice.customerAddress ?? ""),
      vehicle: String(invoice.vehicle ?? ""),
      notes: String(invoice.notes ?? ""),
      terms: String(invoice.terms ?? DEFAULT_TERMS),
      dueDate: String(invoice.dueDate ?? addDaysISO(createdAt, 14)),
      businessName: String(invoice.businessName ?? ""),
      logoText: String(invoice.logoText ?? ""),
      logoDataUrl: String(invoice.logoDataUrl ?? ""),
      tagline: String(invoice.tagline ?? ""),
      accentColor: String(invoice.accentColor ?? DEFAULT_ACCENT),
      includePhotoPage: Boolean(invoice.includePhotoPage),
      photoTitle: String(invoice.photoTitle ?? "Job Photos"),
      photoNotes: String(invoice.photoNotes ?? ""),
      photos,
      lines,
      taxPercent: Number.isFinite(Number(invoice.taxPercent))
        ? Number(invoice.taxPercent)
        : taxableSubtotal > 0
          ? tax / taxableSubtotal * 100
          : 0,
      subtotal: Number.isFinite(Number(invoice.subtotal)) ? Number(invoice.subtotal) : 0,
      tax,
      total: Number.isFinite(Number(invoice.total)) ? Number(invoice.total) : 0,
      createdAt,
      updatedAt: String(invoice.updatedAt ?? ""),
    };
  }).filter((invoice) => invoice.jobIds.length);
}

function sessionMs(session: Session) {
  if (Number.isFinite(Number(session.elapsedSec))) return Math.max(0, Number(session.elapsedSec) * 1000);
  const start = new Date(session.startedAt || session.startISO || new Date().toISOString()).getTime();
  const end = new Date(session.endedAt || session.endISO || new Date().toISOString()).getTime();
  return Math.max(0, end - start - (session.totalPausedMs || 0));
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

function materialLinesForJob(jobId: string, sessions: Session[], inventory: InventoryItem[], labor: LaborBillingSettings): InvoiceLine[] {
  const grouped = new Map<string, { description: string; qty: number; total: number }>();
  for (const session of sessions.filter((item) => item.jobId === jobId)) {
    for (const used of session.usedItems ?? []) {
      const item = inventory.find((inventoryItem) => inventoryItem.id === used.itemId);
      const cost = used.qty * Number(item?.unitPrice ?? 0);
      const revenue = materialCharge(cost, used.billingMode ?? labor.materialBillingMode, used.billingPercent ?? labor.materialBillingPercent) * (1 + labor.materialMarkupPercent / 100);
      if (revenue <= 0) continue;
      const key = used.itemId;
      const existing = grouped.get(key) ?? { description: item?.name || "Material", qty: 0, total: 0 };
      grouped.set(key, { ...existing, qty: existing.qty + used.qty, total: existing.total + revenue });
    }
  }
  return Array.from(grouped.entries()).map(([id, value]) => ({
    id: `mat-${id}`,
    description: value.description,
    qty: value.qty || 1,
    rate: value.qty ? value.total / value.qty : value.total,
    taxable: true,
    kind: "material" as const,
  }));
}

function extraExpenseLines(jobId: string, sessions: Session[]): InvoiceLine[] {
  return sessions
    .filter((session) => session.jobId === jobId)
    .flatMap((session) => (session.extraExpenses ?? []).map((expense) => ({
      id: `exp-${session.id}-${expense.id}`,
      description: expense.name,
      qty: 1,
      rate: expense.amount,
      taxable: false,
      kind: "expense" as const,
    })));
}

function titleFor(job: Job) {
  return job.title || job.name || "Untitled job";
}

function vehicleFor(job: Job) {
  if (!job.vehicle) return "";
  if (typeof job.vehicle === "string") return job.vehicle;
  return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
}

function vehicleTitle(vehicle: CustomerVehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.plate || vehicle.vin || "Vehicle";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function shortDate(value?: string) {
  if (!value) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function addDaysISO(value: string, days: number) {
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) return value;
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function lineTypeLabel(kind: InvoiceLine["kind"]) {
  if (kind === "material") return "Material";
  if (kind === "expense") return "Expense";
  if (kind === "custom") return "Item";
  return "Labor";
}

function makeInvoiceNumber(existing: Invoice[]) {
  return `INV-${String(existing.length + 1).padStart(4, "0")}`;
}

function invoiceJobIds(invoice: Pick<Invoice, "jobId" | "jobIds">) {
  return invoice.jobIds.length ? invoice.jobIds : invoice.jobId ? [invoice.jobId] : [];
}

function buildDefaultLines(job: Job, sessions: Session[], inventory: InventoryItem[], settings: Settings | null): InvoiceLine[] {
  const labor = { ...DEFAULT_LABOR_BILLING, ...(settings?.billing?.labor ?? {}) };
  const jobSessions = sessions.filter((session) => session.jobId === job.id);
  const totalMs = jobSessions.reduce((sum, session) => sum + sessionMs(session), 0);
  const billableHours = labor.enabled ? roundedBillableHours(totalMs / 3600000, labor.minimumHours, labor.billingIncrementMinutes) : 0;
  const lines: InvoiceLine[] = [];
  if (billableHours > 0 && labor.hourlyRate > 0) {
    lines.push({ id: "labor", description: labor.laborLabel || "Labor", qty: billableHours, rate: labor.hourlyRate, taxable: true, kind: "labor" });
  }
  lines.push(...materialLinesForJob(job.id, sessions, inventory, labor));
  lines.push(...extraExpenseLines(job.id, sessions));
  if (lines.length === 0 && job.billingEstimate?.grossPay) {
    lines.push({ id: "estimate", description: "Job total", qty: 1, rate: job.billingEstimate.grossPay, taxable: true, kind: "custom" });
  }
  return lines;
}

function buildDefaultLinesForJobs(jobs: Job[], sessions: Session[], inventory: InventoryItem[], settings: Settings | null): InvoiceLine[] {
  const lines = jobs.flatMap((job) =>
    buildDefaultLines(job, sessions, inventory, settings).map((line) => ({
      ...line,
      id: `${job.id}-${line.id}`,
      description: line.kind === "labor" ? line.description : `${line.description} - ${titleFor(job)}`,
    }))
  );
  return consolidateLaborLines(lines);
}

function consolidateLaborLines(lines: InvoiceLine[], fallbackDescription = "Labor"): InvoiceLine[] {
  const laborLines = lines.filter((line) => line.kind === "labor");
  if (laborLines.length <= 1) return lines;
  const nonLabor = lines.filter((line) => line.kind !== "labor");
  const qty = laborLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const total = laborLines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.rate || 0), 0);
  const description = laborLines.find((line) => line.description.trim())?.description.trim() || fallbackDescription;
  return [
    {
      id: `labor-${uid()}`,
      description,
      qty: qty || 1,
      rate: qty ? total / qty : total,
      taxable: laborLines.some((line) => line.taxable),
      kind: "labor",
    },
    ...nonLabor,
  ];
}

function sessionPhotoSourceId(sessionId: string, id: unknown, fallback: string) {
  const raw = String(id ?? fallback);
  return raw.startsWith(`${sessionId}:`) ? raw : `${sessionId}:${raw}`;
}

function dedupeInvoicePhotos(photos: InvoicePhoto[]) {
  const seenSources = new Set<string>();
  const seenDataUrls = new Set<string>();
  return photos.filter((photo) => {
    const source = photo.sourceId || photo.id;
    if (source && seenSources.has(source)) return false;
    if (photo.dataUrl && seenDataUrls.has(photo.dataUrl)) return false;
    if (source) seenSources.add(source);
    if (photo.dataUrl) seenDataUrls.add(photo.dataUrl);
    return photo.dataUrl || photo.sourceId;
  });
}

function photosForJobs(jobIds: string[], sessions: Session[]): InvoicePhoto[] {
  const photos = sessions
    .filter((session) => jobIds.includes(session.jobId))
    .flatMap((session) => {
      const legacy = Array.isArray(session.photos)
        ? session.photos.map((photo, index) => ({
          id: uid(),
          sourceId: sessionPhotoSourceId(session.id, photo.id, `photo-${index}`),
          name: String(photo.name ?? `Photo ${index + 1}`),
          dataUrl: String(photo.dataUrl ?? ""),
          caption: String(photo.caption ?? ""),
          createdAt: String(photo.createdAt ?? ""),
        }))
        : [];
      const images = Array.isArray(session.images)
        ? session.images.map((image, index) => ({
          id: uid(),
          sourceId: sessionPhotoSourceId(session.id, image.id, `image-${index}`),
          name: String(image.name ?? `Image ${index + 1}`),
          dataUrl: String(image.dataUrl ?? ""),
          caption: "",
          createdAt: String(image.createdISO ?? ""),
        }))
        : [];
      const sheetPhotos = Array.isArray(session.photoSheet?.photos)
        ? session.photoSheet.photos.map((photo, index) => ({
          id: uid(),
          sourceId: sessionPhotoSourceId(session.id, photo.sourceId ?? photo.id, `sheet-${index}`),
          name: String(photo.name ?? `Photo ${index + 1}`),
          dataUrl: String(photo.dataUrl ?? ""),
          caption: String(photo.caption ?? ""),
          createdAt: String(photo.createdAt ?? ""),
        }))
        : [];
      return [...legacy, ...images, ...sheetPhotos].filter((photo) => photo.dataUrl);
    });
  return dedupeInvoicePhotos(photos);
}

function normalizeJobPhotoSheets(raw: unknown): Record<string, JobPhotoSheet> {
  if (!isRecord(raw)) return {};
  const sheets: Record<string, JobPhotoSheet> = {};
  for (const [jobId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    sheets[jobId] = {
      jobId,
      title: typeof value.title === "string" ? value.title : undefined,
      notes: typeof value.notes === "string" ? value.notes : undefined,
      photos: Array.isArray(value.photos)
        ? value.photos.filter(isRecord).map((photo) => ({
          id: String(photo.id ?? uid()),
          sourceId: typeof photo.sourceId === "string" ? photo.sourceId : undefined,
          name: String(photo.name ?? "Photo"),
          dataUrl: String(photo.dataUrl ?? ""),
          caption: String(photo.caption ?? ""),
          createdAt: String(photo.createdAt ?? ""),
        })).filter((photo) => photo.dataUrl || photo.sourceId)
        : [],
    };
  }
  return sheets;
}

function photoSheetPhotosForJobs(jobIds: string[], sheets: Record<string, JobPhotoSheet>): InvoicePhoto[] {
  return jobIds.flatMap((jobId) => {
    const sheet = sheets[jobId];
    return (sheet?.photos ?? []).map((photo, index) => ({
      ...photo,
      id: uid(),
      sourceId: photo.sourceId ?? `job-sheet-${jobId}-${photo.id || index}`,
      name: photo.name || `${sheet?.title || "Job photo sheet"} ${index + 1}`,
      caption: photo.caption,
    }));
  });
}

function firstJobPhotoSheet(jobIds: string[], sheets: Record<string, JobPhotoSheet>) {
  return jobIds.map((jobId) => sheets[jobId]).find((sheet) => sheet && (sheet.title || sheet.notes || sheet.photos?.length));
}

function invoicePhotoSourceMap(jobIds: string[], sheets: Record<string, JobPhotoSheet>, sessions: Session[]) {
  const sources = new Map<string, string>();
  for (const photo of [...photoSheetPhotosForJobs(jobIds, sheets), ...photosForJobs(jobIds, sessions)]) {
    if (photo.sourceId && photo.dataUrl) sources.set(photo.sourceId, photo.dataUrl);
  }
  return sources;
}

function hydrateInvoicePhotos(invoice: Invoice, sheets: Record<string, JobPhotoSheet>, sessions: Session[]): Invoice {
  const sources = invoicePhotoSourceMap(invoiceJobIds(invoice), sheets, sessions);
  return {
    ...invoice,
    photos: invoice.photos
      .map((photo) => ({
        ...photo,
        dataUrl: photo.dataUrl || (photo.sourceId ? sources.get(photo.sourceId) ?? "" : ""),
      }))
      .filter((photo) => photo.dataUrl || photo.sourceId),
  };
}

function displayPhotoUrl(photo: InvoicePhoto, sources: Map<string, string>) {
  return photo.dataUrl || (photo.sourceId ? sources.get(photo.sourceId) ?? "" : "");
}

function compactInvoiceForStorage(invoice: Invoice): Invoice {
  return {
    ...invoice,
    photos: invoice.photos.map((photo) => ({
      ...photo,
      dataUrl: photo.sourceId ? "" : stripOversizedPhotoDataUrl(photo.dataUrl),
    })),
  };
}

function saveInvoicesSafely(invoices: Invoice[]) {
  const payload = JSON.stringify(invoices.map(compactInvoiceForStorage));
  try {
    localStorage.setItem(INVOICES_KEY, payload);
  } catch (error) {
    const previous = localStorage.getItem(INVOICES_KEY);
    try {
      localStorage.removeItem(INVOICES_KEY);
      localStorage.setItem(INVOICES_KEY, payload);
    } catch {
      if (previous !== null) localStorage.setItem(INVOICES_KEY, previous);
      throw error;
    }
  }
}

function pruneOversizedStoredPhotos() {
  const prunePhoto = (photo: Record<string, unknown>): Record<string, unknown> => ({
    ...photo,
    dataUrl: stripOversizedPhotoDataUrl(String(photo.dataUrl ?? "")),
  });

  try {
    const rawSessions = localStorage.getItem(KEYS.sessions);
    if (rawSessions) {
      const parsed = JSON.parse(rawSessions);
      const sessions = asList<Record<string, unknown>>(parsed, "sessions").filter(isRecord).map((session) => {
        const photos = Array.isArray(session.photos)
          ? session.photos.filter(isRecord).map(prunePhoto).filter((photo) => photo.dataUrl)
          : session.photos;
        const photoSheet = isRecord(session.photoSheet)
          ? {
              ...session.photoSheet,
              photos: Array.isArray(session.photoSheet.photos)
                ? session.photoSheet.photos.filter(isRecord).map(prunePhoto).filter((photo) => photo.dataUrl || typeof photo.sourceId === "string")
                : session.photoSheet.photos,
            }
          : session.photoSheet;
        return { ...session, photos, photoSheet };
      });
      localStorage.setItem(KEYS.sessions, JSON.stringify(Array.isArray(parsed) ? sessions : { ...parsed, sessions }));
    }
  } catch {}

  try {
    const rawSheets = localStorage.getItem(PHOTO_SHEETS_KEY);
    if (rawSheets) {
      const parsed = JSON.parse(rawSheets);
      if (isRecord(parsed)) {
        const sheets = Object.fromEntries(Object.entries(parsed).map(([jobId, sheet]) => {
          if (!isRecord(sheet)) return [jobId, sheet];
          return [jobId, {
            ...sheet,
            photos: Array.isArray(sheet.photos)
              ? sheet.photos.filter(isRecord).map(prunePhoto).filter((photo) => photo.dataUrl || typeof photo.sourceId === "string")
              : sheet.photos,
          }];
        }));
        localStorage.setItem(PHOTO_SHEETS_KEY, JSON.stringify(sheets));
      }
    }
  } catch {}

  try {
    const rawInvoices = localStorage.getItem(INVOICES_KEY);
    if (rawInvoices) {
      const parsed = JSON.parse(rawInvoices);
      const invoices = asList<Record<string, unknown>>(parsed, "invoices").filter(isRecord).map((invoice) => ({
        ...invoice,
        photos: Array.isArray(invoice.photos)
          ? invoice.photos.filter(isRecord).map((photo) => ({ ...photo, dataUrl: "" }))
          : invoice.photos,
      }));
      localStorage.setItem(INVOICES_KEY, JSON.stringify(Array.isArray(parsed) ? invoices : { ...parsed, invoices }));
    }
  } catch {}
}

export default function InvoiceBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = params.id;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobPhotoSheets, setJobPhotoSheets] = useState<Record<string, JobPhotoSheet>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryAmounts, setInventoryAmounts] = useState<Record<string, number>>({});
  const [inventoryPercents, setInventoryPercents] = useState<Record<string, number>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Record<string, true>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loadedJobs = normalizeJobs(loadJSON<unknown>(KEYS.jobs, []));
      const loadedSessions = normalizeSessions(loadJSON<unknown>(KEYS.sessions, []));
      const loadedInventory = normalizeInventory(loadJSON<unknown>(KEYS.inventory, { items: [] }));
      const loadedCustomers = normalizeCustomers(loadJSON<unknown>(CUSTOMERS_KEY, { customers: [] }));
      const loadedPhotoSheets = normalizeJobPhotoSheets(loadJSON<unknown>(PHOTO_SHEETS_KEY, {}));
      const loadedSettings = loadJSON<Settings | null>(KEYS.settings, null);
      const loadedInvoices = normalizeInvoices(loadJSON<unknown>(INVOICES_KEY, []));
      const existing = loadedInvoices.find((item) => item.id === routeId || item.jobId === routeId || item.jobIds.includes(routeId));
      const targetJobIds = existing ? invoiceJobIds(existing) : [routeId];
      const invoiceJobs = loadedJobs.filter((item) => targetJobIds.includes(item.id));
      const primaryJob = invoiceJobs[0];
      const now = new Date().toISOString();
      setJobs(loadedJobs);
      setSessions(loadedSessions);
      setInventory(loadedInventory);
      setCustomers(loadedCustomers);
      setJobPhotoSheets(loadedPhotoSheets);
      setSettings(loadedSettings);
      setInvoices(loadedInvoices);
      if (primaryJob) {
        const generatedLines = buildDefaultLinesForJobs(invoiceJobs, loadedSessions, loadedInventory, loadedSettings);
        setInvoice(existing ? hydrateInvoicePhotos({
          ...existing,
          lines: existing.lines.length ? existing.lines : generatedLines,
          tax: existing.tax || invoiceJobs.reduce((sum, job) => sum + Number(job.billingEstimate?.taxTotal ?? 0), 0),
        }, loadedPhotoSheets, loadedSessions) : {
          id: uid(),
          jobId: primaryJob.id,
          jobIds: invoiceJobs.map((job) => job.id),
          invoiceNumber: makeInvoiceNumber(loadedInvoices),
          status: "draft",
          customer: primaryJob.customerName || primaryJob.customer || "",
          customerBusiness: "",
          customerPhone: "",
          customerEmail: "",
          customerAddress: "",
          vehicle: invoiceJobs.length > 1 ? "Multiple jobs" : vehicleFor(primaryJob),
          notes: "Thank you for your business.",
          terms: DEFAULT_TERMS,
          dueDate: addDaysISO(now, 14),
          businessName: loadedSettings?.shop?.business || loadedSettings?.shop?.name || "MARshall OS",
          logoText: loadedSettings?.shop?.business || loadedSettings?.shop?.name || "MARshall OS",
          logoDataUrl: loadedSettings?.shop?.logoDataUrl ?? "",
          tagline: "",
          accentColor: DEFAULT_ACCENT,
          includePhotoPage: false,
          photoTitle: "Job Photos",
          photoNotes: "",
          photos: [],
          lines: generatedLines,
          taxPercent: loadedSettings?.billing?.labor?.taxPercent ?? DEFAULT_LABOR_BILLING.taxPercent,
          subtotal: 0,
          tax: 0,
          total: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [routeId]);

  const invoiceJobs = invoice ? jobs.filter((item) => invoiceJobIds(invoice).includes(item.id)) : [];
  const job = invoiceJobs[0];
  const qJobs = jobQuery.trim().toLowerCase();
  const availableJobs = jobs
    .filter((item) => item.status === "done" && item.invoiceReady && (!invoice || !invoiceJobIds(invoice).includes(item.id)))
    .filter((item) => !qJobs || `${titleFor(item)} ${item.customerName ?? ""} ${item.customer ?? ""} ${vehicleFor(item)}`.toLowerCase().includes(qJobs))
    .slice(0, 8);
  const qInventory = inventoryQuery.trim().toLowerCase();
  const visibleInventory = inventory
    .filter((item) => !qInventory || `${item.name ?? ""} ${item.unit ?? ""}`.toLowerCase().includes(qInventory))
    .slice(0, 10);
  const subtotal = invoice?.lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.rate || 0), 0) ?? 0;
  const taxableSubtotal = invoice?.lines.reduce((sum, line) => sum + (line.taxable ? Number(line.qty || 0) * Number(line.rate || 0) : 0), 0) ?? 0;
  const taxPercent = Number(invoice?.taxPercent ?? settings?.billing?.labor?.taxPercent ?? 0);
  const tax = taxableSubtotal * taxPercent / 100;
  const total = subtotal + tax;
  const laborDescription = invoice?.lines.find((line) => line.kind === "labor")?.description ?? "";
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const availableInvoicePhotos = invoice ? dedupeInvoicePhotos([
    ...photoSheetPhotosForJobs(invoiceJobIds(invoice), jobPhotoSheets),
    ...photosForJobs(invoiceJobIds(invoice), sessions),
  ]) : [];
  const photoSources = invoice ? invoicePhotoSourceMap(invoiceJobIds(invoice), jobPhotoSheets, sessions) : new Map<string, string>();
  const unusedInvoicePhotos = availableInvoicePhotos.filter((photo) => !invoice?.photos.some((item) => item.sourceId === photo.sourceId));
  const matchingJobPhotoSheet = invoice ? firstJobPhotoSheet(invoiceJobIds(invoice), jobPhotoSheets) : undefined;
  const selectedPhotoCount = Object.keys(selectedPhotoIds).length;

  const updateInvoice = (patch: Partial<Invoice>) => {
    setInvoice((current) => current ? { ...current, ...patch } : current);
    setSavedAt("");
  };

  const updateLine = (id: string, patch: Partial<InvoiceLine>) => {
    setInvoice((current) =>
      current ? { ...current, lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) } : current
    );
    setSavedAt("");
  };

  const addLine = () => {
    setInvoice((current) =>
      current ? { ...current, lines: [...current.lines, { id: uid(), description: "", qty: 1, rate: 0, taxable: true, kind: "custom" }] } : current
    );
    setSavedAt("");
  };

  const updateLaborDescription = (description: string) => {
    setInvoice((current) =>
      current ? { ...current, lines: current.lines.map((line) => (line.kind === "labor" ? { ...line, description } : line)) } : current
    );
    setSavedAt("");
  };

  const combineLaborLines = () => {
    setInvoice((current) => current ? { ...current, lines: consolidateLaborLines(current.lines, laborDescription || "Labor") } : current);
    setSavedAt("");
  };

  const uploadLogo = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateInvoice({ logoDataUrl: typeof reader.result === "string" ? reader.result : "" });
    };
    reader.readAsDataURL(file);
  };

  const addJobToInvoice = (jobToAdd: Job) => {
    setInvoice((current) => {
      if (!current || current.jobIds.includes(jobToAdd.id)) return current;
      const nextJobIds = [...invoiceJobIds(current), jobToAdd.id];
      return {
        ...current,
        jobIds: nextJobIds,
        vehicle: nextJobIds.length > 1 ? "Multiple jobs" : current.vehicle,
        lines: consolidateLaborLines([...current.lines, ...buildDefaultLinesForJobs([jobToAdd], sessions, inventory, settings)]),
      };
    });
    setJobQuery("");
    setSavedAt("");
  };

  const addInventoryLine = (item: InventoryItem) => {
    const qty = Number(inventoryAmounts[item.id] ?? 1) || 1;
    const percent = Math.max(0, Number(inventoryPercents[item.id] ?? 100) || 0);
    setInvoice((current) =>
      current ? {
        ...current,
        lines: [
          ...current.lines,
          {
            id: uid(),
            description: `${item.name || "Inventory item"}${percent !== 100 ? ` (${percent}% customer billed)` : ""}`,
            qty,
            rate: Number(item.unitPrice ?? 0) * percent / 100,
            taxable: true,
            kind: "material",
          },
        ],
      } : current
    );
    setInventoryAmounts((current) => ({ ...current, [item.id]: 1 }));
    setInventoryPercents((current) => ({ ...current, [item.id]: 100 }));
    setSavedAt("");
  };

  const removeJobFromInvoice = (jobId: string) => {
    setInvoice((current) => {
      if (!current) return current;
      const nextJobIds = invoiceJobIds(current).filter((id) => id !== jobId);
      if (!nextJobIds.length) return current;
      return {
        ...current,
        jobId: nextJobIds[0],
        jobIds: nextJobIds,
        vehicle: nextJobIds.length > 1 ? "Multiple jobs" : vehicleFor(jobs.find((item) => item.id === nextJobIds[0]) ?? job),
        lines: current.lines.filter((line) => !line.id.startsWith(`${jobId}-`)),
      };
    });
    setSavedAt("");
  };

  const applyCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const vehicle = customer.vehicles.find(vehicleHasContent) ?? customer.vehicle;
    updateInvoice({
      customer: customer.name,
      customerBusiness: customer.business,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerAddress: customer.address,
      vehicle: vehicleHasContent(vehicle) ? vehicleTitle(vehicle) : invoice?.vehicle ?? "",
    });
  };

  const saveInvoiceCustomer = () => {
    if (!invoice) return;
    const existing = selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) : undefined;
    const vehicle = normalizeVehicle({
      ...(existing?.vehicles?.[0] ?? {}),
      make: invoice.vehicle,
    });
    const nextCustomer = normalizeCustomer({
      ...(existing ?? blankCustomer()),
      name: invoice.customer,
      business: invoice.customerBusiness,
      phone: invoice.customerPhone,
      email: invoice.customerEmail,
      address: invoice.customerAddress,
      vehicles: existing?.vehicles?.length ? existing.vehicles : [vehicle],
    });
    const nextCustomers = existing
      ? customers.map((customer) => (customer.id === existing.id ? nextCustomer : customer))
      : [nextCustomer, ...customers];
    setCustomers(nextCustomers);
    setSelectedCustomerId(nextCustomer.id);
    saveJSON(CUSTOMERS_KEY, { customers: nextCustomers, meta: { savedAt: new Date().toISOString() } });
    setSavedAt("customer saved");
  };

  const removeLine = (id: string) => {
    setInvoice((current) => current ? { ...current, lines: current.lines.filter((line) => line.id !== id) } : current);
    setSavedAt("");
  };

  const updatePhoto = (id: string, patch: Partial<InvoicePhoto>) => {
    setInvoice((current) =>
      current ? { ...current, photos: current.photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)) } : current
    );
    setSavedAt("");
  };

  const removePhoto = (id: string) => {
    setInvoice((current) => current ? { ...current, photos: current.photos.filter((photo) => photo.id !== id) } : current);
    setSavedAt("");
  };

  const movePhoto = (id: string, direction: -1 | 1) => {
    setInvoice((current) => {
      if (!current) return current;
      const index = current.photos.findIndex((photo) => photo.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.photos.length) return current;
      const nextPhotos = [...current.photos];
      [nextPhotos[index], nextPhotos[nextIndex]] = [nextPhotos[nextIndex], nextPhotos[index]];
      return { ...current, photos: nextPhotos };
    });
    setSavedAt("");
  };

  const addSelectedPhotos = () => {
    setInvoice((current) => {
      if (!current) return current;
      const additions = unusedInvoicePhotos
        .filter((photo) => selectedPhotoIds[photo.sourceId ?? photo.id])
        .map((photo) => ({ ...photo, id: uid() }));
      return {
        ...current,
        includePhotoPage: true,
        photoTitle: current.photoTitle || matchingJobPhotoSheet?.title || "Job Photos",
        photoNotes: current.photoNotes || matchingJobPhotoSheet?.notes || "",
        photos: [...current.photos, ...additions],
      };
    });
    setSelectedPhotoIds({});
    setPhotoModalOpen(false);
    setSavedAt("");
  };

  const addUploadedPhotos = async (files: FileList | null) => {
    if (!files) return;
    const photos = await Promise.all(Array.from(files).filter((file) => file.type.startsWith("image/")).map(async (file) => ({
      id: uid(),
      name: file.name,
      dataUrl: await photoFileToStorageDataUrl(file),
      caption: "",
      createdAt: new Date().toISOString(),
    }))).then((items) => items.filter((photo) => photo.dataUrl));
    setInvoice((current) => current ? { ...current, includePhotoPage: true, photos: [...current.photos, ...photos] } : current);
    setSavedAt("");
  };

  const importJobPhotoSheet = () => {
    if (!invoice) return;
    const jobIds = invoiceJobIds(invoice);
    const sheet = firstJobPhotoSheet(jobIds, jobPhotoSheets);
    const photos = photoSheetPhotosForJobs(jobIds, jobPhotoSheets);
    setInvoice((current) => {
      if (!current) return current;
      const existingSourceIds = new Set(current.photos.map((photo) => photo.sourceId).filter(Boolean));
      const additions = photos.filter((photo) => !existingSourceIds.has(photo.sourceId));
      return {
        ...current,
        includePhotoPage: true,
        photoTitle: sheet?.title || current.photoTitle || "Job Photos",
        photoNotes: sheet?.notes || current.photoNotes,
        photos: [...current.photos, ...additions],
      };
    });
    setSavedAt("");
  };

  const saveInvoice = (status: Invoice["status"] = invoice?.status ?? "draft", message?: string) => {
    if (!invoice) return null;
    const now = new Date().toISOString();
    const nextInvoice: Invoice = { ...invoice, status, jobIds: invoiceJobIds(invoice), subtotal, tax, total, updatedAt: now };
    const nextInvoices = invoices.some((item) => item.id === nextInvoice.id)
      ? invoices.map((item) => (item.id === nextInvoice.id ? nextInvoice : item))
      : [nextInvoice, ...invoices];
    setInvoice(nextInvoice);
    setInvoices(nextInvoices);
    try {
      saveInvoicesSafely(nextInvoices);
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setSavedAt(message ? `${message} at ${time}` : time);
    } catch {
      pruneOversizedStoredPhotos();
      const trimmedInvoices = nextInvoices.map((item) => ({
        ...item,
        photos: item.photos.map((photo) => ({ ...photo, dataUrl: "" })),
      }));
      setInvoices(trimmedInvoices);
      setInvoice(trimmedInvoices.find((item) => item.id === nextInvoice.id) ?? nextInvoice);
      try {
        saveInvoicesSafely(trimmedInvoices);
        setSavedAt("storage full - large invoice photos were removed");
      } catch {
        setSavedAt("storage full - remove photos or old drafts");
      }
    }
    return nextInvoice;
  };

  const deleteInvoice = () => {
    if (!invoice) return;
    const nextInvoices = invoices.filter((item) => item.id !== invoice.id);
    setInvoices(nextInvoices);
    saveInvoicesSafely(nextInvoices);
    router.push("/billing");
  };

  const savePhotoSheetDraft = () => {
    saveInvoice("draft", "photo sheet saved");
  };

  const printInvoice = () => {
    saveInvoice(invoice?.status ?? "draft");
    window.setTimeout(() => window.print(), 125);
  };

  if (!job || !invoice) {
    return (
      <main className="wrap">
        <ApplyWallpaper />
        <section className="panel">
          <div className="panelTitle">Invoice job not found.</div>
          <Link className="btn ghost" href="/billing">Back to Billing</Link>
        </section>
        <style jsx global>{styles}</style>
      </main>
    );
  }

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">INVOICE BUILDER</div>
          <h1>{invoice.invoiceNumber}</h1>
          <p>{invoiceJobs.map(titleFor).join(" + ")} · {invoice.customer || "No customer"} · {invoice.vehicle || "No vehicle"}</p>
        </div>
          <div className="topActions">
          {savedAt && <span className="saved">{savedAt.includes(" at ") || savedAt.includes("full") ? savedAt : `Saved at ${savedAt}`}</span>}
          <button className="btn primary" onClick={() => saveInvoice("draft")}>Save Draft</button>
          <button className="btn ghost" onClick={() => saveInvoice("sent")}>Mark Sent</button>
          <button className="btn paid" onClick={() => saveInvoice("paid")}>Save As Paid</button>
          <button className="btn ghost" onClick={printInvoice}>Print / Save PDF</button>
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete Invoice</button>
          <Link className="btn ghost" href="/billing">Billing</Link>
        </div>
      </header>

      <section className="layout">
        <section className="panel">
          <div className="panelTitle">Invoice Details</div>
          <div className="formGrid">
            <label className="label">Invoice number
              <input className="input" value={invoice.invoiceNumber} onChange={(event) => updateInvoice({ invoiceNumber: event.target.value })} />
            </label>
            <label className="label">Status
              <select className="input" value={invoice.status} onChange={(event) => updateInvoice({ status: event.target.value as Invoice["status"] })}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="label">Due date
              <input className="input" type="date" value={dateInputValue(invoice.dueDate)} onChange={(event) => updateInvoice({ dueDate: event.target.value })} />
            </label>
            <label className="label">Customer
              <input className="input" value={invoice.customer} onChange={(event) => updateInvoice({ customer: event.target.value })} />
            </label>
            <label className="label">Customer on file
              <select className="input" value={selectedCustomerId} onChange={(event) => applyCustomer(event.target.value)}>
                <option value="">Select customer...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name || "Unnamed customer"}{customer.business ? ` - ${customer.business}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">Business
              <input className="input" value={invoice.customerBusiness} onChange={(event) => updateInvoice({ customerBusiness: event.target.value })} />
            </label>
            <label className="label">Phone
              <input className="input" value={invoice.customerPhone} onChange={(event) => updateInvoice({ customerPhone: event.target.value })} />
            </label>
            <label className="label">Email
              <input className="input" value={invoice.customerEmail} onChange={(event) => updateInvoice({ customerEmail: event.target.value })} />
            </label>
            <label className="label">Address
              <input className="input" value={invoice.customerAddress} onChange={(event) => updateInvoice({ customerAddress: event.target.value })} />
            </label>
            <label className="label">Vehicle
              <input className="input" value={invoice.vehicle} onChange={(event) => updateInvoice({ vehicle: event.target.value })} />
            </label>
          </div>
          <div className="customerActions">
            {selectedCustomer && (
              <div className="vehicleButtons">
                {selectedCustomer.vehicles.filter(vehicleHasContent).map((vehicle) => (
                  <button className="btn ghost" key={vehicle.id} onClick={() => updateInvoice({ vehicle: vehicleTitle(vehicle) })}>
                    Use {vehicleTitle(vehicle)}
                  </button>
                ))}
              </div>
            )}
            <button className="btn ghost" onClick={saveInvoiceCustomer}>Save Customer Info On File</button>
          </div>

          <div className="subPanel">
            <div>
              <div className="panelTitle">Invoice Style</div>
              <div className="panelText">This controls the printable invoice header and accent color.</div>
            </div>
            <div className="formGrid">
              <label className="label">Business name
                <input className="input" value={invoice.businessName} onChange={(event) => updateInvoice({ businessName: event.target.value })} />
              </label>
              <label className="label">Logo text
                <input className="input" value={invoice.logoText} onChange={(event) => updateInvoice({ logoText: event.target.value })} />
              </label>
              <label className="label">Logo image
                <input className="input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              </label>
              <label className="label">Motto / tagline
                <input className="input" value={invoice.tagline} onChange={(event) => updateInvoice({ tagline: event.target.value })} placeholder="Quality refinishing, done right" />
              </label>
              <label className="label">Accent color
                <input className="input colorInput" type="color" value={invoice.accentColor} onChange={(event) => updateInvoice({ accentColor: event.target.value })} />
              </label>
            </div>
          </div>

          <div className="subPanel">
            <div className="lineHead">
              <div>
                <div className="panelTitle">Jobs On This Invoice</div>
                <div className="panelText">Bundle other finished jobs into this same draft.</div>
              </div>
            </div>
            <div className="jobPills">
              {invoiceJobs.map((item) => (
                <span className="jobPill" key={item.id}>
                  {titleFor(item)}
                  {invoiceJobs.length > 1 && <button onClick={() => removeJobFromInvoice(item.id)} aria-label={`Remove ${titleFor(item)}`}>x</button>}
                </span>
              ))}
            </div>
            <input className="input" value={jobQuery} onChange={(event) => setJobQuery(event.target.value)} placeholder="Search finished jobs to add..." />
            <div className="miniList">
              {availableJobs.map((item) => (
                <button className="miniItem" key={item.id} onClick={() => addJobToInvoice(item)}>
                  <span>{titleFor(item)}</span>
                  <small>{item.customerName || item.customer || "No customer"} · {vehicleFor(item) || "No vehicle"}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="subPanel">
            <div>
              <div className="panelTitle">Add Inventory</div>
              <div className="panelText">Search inventory, enter the amount used, and add it as a material line.</div>
            </div>
            <input className="input" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Search inventory items..." />
            <div className="inventoryList">
              {visibleInventory.map((item) => (
                <div className="inventoryItem" key={item.id}>
                  <div>
                    <strong>{item.name || "Inventory item"}</strong>
                    <small>{money(Number(item.unitPrice ?? 0))} / {item.unit || "unit"}</small>
                  </div>
                  <label className="miniField">
                    <span>Quantity</span>
                    <DecimalInput
                      className="input num"
                      value={inventoryAmounts[item.id] ?? 1}
                      onValueChange={(value) => setInventoryAmounts((current) => ({ ...current, [item.id]: value }))}
                      aria-label={`Quantity of ${item.name || "inventory item"}`}
                    />
                  </label>
                  <label className="miniField">
                    <span>Percent</span>
                    <DecimalInput
                      className="input num"
                      value={inventoryPercents[item.id] ?? 100}
                      onValueChange={(value) => setInventoryPercents((current) => ({ ...current, [item.id]: value }))}
                      aria-label={`Customer paid percent of ${item.name || "inventory item"}`}
                      title="Customer pays percent"
                    />
                  </label>
                  <button className="btn ghost" onClick={() => addInventoryLine(item)}>Add</button>
                </div>
              ))}
            </div>
          </div>

          <label className="label">Labor description
            <input className="input" value={laborDescription} onChange={(event) => updateLaborDescription(event.target.value)} placeholder="Labor description shown on labor lines" />
          </label>
          <div className="customerActions">
            <button className="btn ghost" onClick={combineLaborLines}>Combine Labor Into One Line</button>
          </div>

          <div className="lineHead">
            <div>
              <div className="panelTitle">Line Items</div>
              <div className="panelText">Generated from labor, materials, and review expenses. Edit freely before saving.</div>
            </div>
            <button className="btn ghost" onClick={addLine}>Add Line</button>
          </div>

          <div className="lineList">
            <div className="lineLabels" aria-hidden="true">
              <span>Type</span>
              <span>Description</span>
              <span>Quantity</span>
              <span>Rate / unit price</span>
              <span>Tax</span>
              <span>Amount</span>
              <span />
            </div>
            {invoice.lines.map((line) => (
              <div className="lineRow" key={line.id}>
                <select className="input kind" value={line.kind} onChange={(event) => updateLine(line.id, { kind: event.target.value as InvoiceLine["kind"] })}>
                  <option value="labor">Labor</option>
                  <option value="material">Material</option>
                  <option value="expense">Expense</option>
                  <option value="custom">Custom</option>
                </select>
                <input className="input" value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} placeholder="Description" />
                <DecimalInput className="input num" aria-label="Quantity" value={line.qty} onValueChange={(value) => updateLine(line.id, { qty: value })} />
                <DecimalInput className="input num" aria-label="Rate or unit price" value={line.rate} onValueChange={(value) => updateLine(line.id, { rate: value })} />
                <button className={`taxToggle ${line.taxable ? "on" : ""}`} onClick={() => updateLine(line.id, { taxable: !line.taxable })}>
                  {line.taxable ? "Taxed" : "No tax"}
                </button>
                <strong>{money(line.qty * line.rate)}</strong>
                <button className="btn ghost" onClick={() => removeLine(line.id)}>Remove</button>
              </div>
            ))}
          </div>

          <label className="label">Notes
            <textarea className="input notes" value={invoice.notes} onChange={(event) => updateInvoice({ notes: event.target.value })} />
          </label>
          <label className="label">Terms
            <textarea className="input notes shortNotes" value={invoice.terms} onChange={(event) => updateInvoice({ terms: event.target.value })} />
          </label>

          <div className="subPanel">
            <div className="lineHead">
              <div>
                <div className="panelTitle">Photo Page</div>
                <div className="panelText">Add a second invoice page with selected job photos, arrangement, and captions.</div>
              </div>
              <button className={`btn ${invoice.includePhotoPage ? "primary" : "ghost"}`} onClick={() => updateInvoice({ includePhotoPage: !invoice.includePhotoPage })}>
                {invoice.includePhotoPage ? "Photo Sheet On" : "Photo Sheet Off"}
              </button>
            </div>
            <div className="formGrid">
              <label className="label">Photo page title
                <input className="input" value={invoice.photoTitle} onChange={(event) => updateInvoice({ photoTitle: event.target.value })} />
              </label>
              <label className="label">Photo page notes
                <input className="input" value={invoice.photoNotes} onChange={(event) => updateInvoice({ photoNotes: event.target.value })} placeholder="Before/after photos, teardown notes..." />
              </label>
            </div>
            <div className="customerActions">
              <button className="btn ghost" disabled={!matchingJobPhotoSheet?.photos?.length} onClick={importJobPhotoSheet}>Import Photo Sheet</button>
              <button className="btn ghost" onClick={() => setPhotoModalOpen(true)}>Add Photos</button>
              <label className="btn ghost">Upload Photos<input type="file" accept="image/*" multiple onChange={(event) => addUploadedPhotos(event.target.files)} hidden /></label>
              <button className="btn primary" onClick={savePhotoSheetDraft}>Save Photo Sheet With Draft</button>
            </div>
            {matchingJobPhotoSheet?.photos?.length ? (
              <div className="panelText">Found saved job photo sheet: {matchingJobPhotoSheet.title || "Job Photos"} ({matchingJobPhotoSheet.photos.length} photo{matchingJobPhotoSheet.photos.length === 1 ? "" : "s"}).</div>
            ) : (
              <div className="panelText">No saved job photo sheet found yet. You can still add raw job photos or uploads.</div>
            )}
            <div className="invoicePhotoList">
              {invoice.photos.map((photo, index) => (
                <article className="invoicePhotoRow" key={photo.id}>
                  {displayPhotoUrl(photo, photoSources) ? (
                    <img src={displayPhotoUrl(photo, photoSources)} alt={photo.caption || photo.name} />
                  ) : (
                    <div className="photoMissing">Photo source missing</div>
                  )}
                  <div>
                    <div className="photoMeta">Photo {index + 1} · {photo.name}</div>
                    <textarea className="input photoCaption" value={photo.caption} onChange={(event) => updatePhoto(photo.id, { caption: event.target.value })} placeholder="Caption..." />
                    <div className="customerActions">
                      <button className="btn ghost" disabled={index === 0} onClick={() => movePhoto(photo.id, -1)}>Move Up</button>
                      <button className="btn ghost" disabled={index === invoice.photos.length - 1} onClick={() => movePhoto(photo.id, 1)}>Move Down</button>
                      <button className="btn danger" onClick={() => removePhoto(photo.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              ))}
              {invoice.photos.length === 0 && <div className="emptyPhoto">No photos selected yet.</div>}
            </div>
          </div>

          <section className="previewPanel">
            <div className="lineHead">
              <div>
                <div className="panelTitle">Invoice Preview</div>
                <div className="panelText">This is the document that prints or saves as PDF.</div>
              </div>
              <button className="btn primary" onClick={printInvoice}>Print / Save PDF</button>
            </div>
            <div className="previewFrame">
              <PrintableInvoice
                invoice={invoice}
                photoSources={photoSources}
                jobs={invoiceJobs}
                settings={settings}
                subtotal={subtotal}
                tax={tax}
                total={total}
                mode="preview"
              />
            </div>
          </section>
        </section>

        <aside className="panel summary">
          <div>
            <div className="panelTitle">Invoice Summary</div>
            <div className="panelText">Final invoice math for this draft.</div>
          </div>
          <MoneyLine label="Subtotal" value={money(subtotal)} />
          <MoneyLine label="Taxable subtotal" value={money(taxableSubtotal)} />
          <label className="label">Tax percent
            <DecimalInput className="input" value={taxPercent} onValueChange={(value) => updateInvoice({ taxPercent: value })} />
          </label>
          <MoneyLine label="Tax" value={money(tax)} />
          <MoneyLine label="Total" value={money(total)} strong />
          <div className="divider" />
          <MoneyLine label="Original gross estimate" value={money(invoiceJobs.reduce((sum, item) => sum + Number(item.billingEstimate?.grossPay ?? 0), 0))} />
          <MoneyLine label="Estimated expenses" value={money(invoiceJobs.reduce((sum, item) => sum + Number(item.billingEstimate?.totalExpenses ?? 0), 0))} />
          <MoneyLine label="Estimated net" value={money(invoiceJobs.reduce((sum, item) => sum + Number(item.billingEstimate?.netPay ?? 0), 0))} />
          {invoiceJobs.map((item) => <Link className="btn ghost" href={`/jobs/${item.id}`} key={item.id}>Open {titleFor(item)}</Link>)}
        </aside>
      </section>

      <PrintableInvoice
        invoice={invoice}
        photoSources={photoSources}
        jobs={invoiceJobs}
        settings={settings}
        subtotal={subtotal}
        tax={tax}
        total={total}
        mode="print"
      />

      {photoModalOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Add invoice photos">
          <section className="photoModal">
            <div className="lineHead">
              <div>
                <div className="panelTitle">Photos From Invoice Jobs</div>
                <div className="panelText">Select photos from saved job photo sheets and raw session photos.</div>
              </div>
              <button className="btn ghost" onClick={() => setPhotoModalOpen(false)}>Close</button>
            </div>
            <div className="sourcePhotoGrid">
              {unusedInvoicePhotos.map((photo) => {
                const key = photo.sourceId ?? photo.id;
                return (
                  <button
                    className={`sourcePhoto ${selectedPhotoIds[key] ? "on" : ""}`}
                    key={key}
                    onClick={() => setSelectedPhotoIds((current) => {
                      const next = { ...current };
                      if (next[key]) delete next[key];
                      else next[key] = true;
                      return next;
                    })}
                  >
                    <img src={photo.dataUrl} alt={photo.name} />
                    <span>{photo.name}</span>
                  </button>
                );
              })}
              {unusedInvoicePhotos.length === 0 && <div className="emptyPhoto">No unused photos found on the invoice jobs.</div>}
            </div>
            <div className="customerActions modalActions">
              <button className="btn ghost" onClick={() => setPhotoModalOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={selectedPhotoCount === 0} onClick={addSelectedPhotos}>Add {selectedPhotoCount || ""} Photo{selectedPhotoCount === 1 ? "" : "s"}</button>
            </div>
          </section>
        </div>
      )}

      {confirmDelete && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Confirm invoice delete">
          <section className="modal">
            <div className="modalTop">
              <div>
                <div className="panelTitle">Confirm invoice deletion</div>
                <div className="panelText">
                  This will permanently delete {invoice.invoiceNumber || "this invoice"}. The linked job stays in the job list.
                </div>
              </div>
              <button className="x" onClick={() => setConfirmDelete(false)}>Close</button>
            </div>
            <div className="modalActions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn danger" onClick={deleteInvoice}>Delete Invoice</button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function MoneyLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`moneyLine ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function PrintableInvoice({
  invoice,
  photoSources,
  jobs,
  settings,
  subtotal,
  tax,
  total,
  mode,
}: {
  invoice: Invoice;
  photoSources: Map<string, string>;
  jobs: Job[];
  settings: Settings | null;
  subtotal: number;
  tax: number;
  total: number;
  mode: "preview" | "print";
}) {
  const shopName = invoice.businessName || settings?.shop?.business || settings?.shop?.name || "MARshall OS";
  const logoText = invoice.logoText || shopName;
  const accent = invoice.accentColor || DEFAULT_ACCENT;
  const alertEmails = settings?.shop?.alertEmails ?? [];
  const shopEmail = alertEmails[0] ?? "";
  const shopPhone = settings?.user?.phone ?? "";
  const shopContact = [shopEmail, shopPhone].filter(Boolean).join(" · ");
  const invoiceDateISO = invoice.updatedAt || invoice.createdAt;
  const invoiceDate = shortDate(invoiceDateISO);
  const dueDate = shortDate(invoice.dueDate || addDaysISO(invoiceDateISO, 14));

  return (
    <section className={`pdfSheet ${mode === "preview" ? "previewSheet" : "printSheet"}`} aria-label="Printable invoice">
      <header className="pdfHeader" style={{ borderBottomColor: accent }}>
        <div>
          {invoice.logoDataUrl ? (
            <div className="pdfLogoImage" style={{ backgroundImage: `url(${invoice.logoDataUrl})` }} aria-label={logoText} />
          ) : (
            <div className="pdfBrandMark" style={{ borderColor: accent }}>{logoText}</div>
          )}
          <div className="pdfShop">{shopName}</div>
          {invoice.tagline && <div className="pdfTagline">{invoice.tagline}</div>}
          {shopContact && <div className="pdfMuted">{shopContact}</div>}
        </div>
        <div className="pdfInvoiceMeta">
          <div className="pdfInvoiceTitle">Invoice</div>
          <div className="pdfNumber" style={{ color: accent }}>{invoice.invoiceNumber}</div>
          <div className="pdfMetaGrid">
            <span>Date</span><strong>{invoiceDate}</strong>
            <span>Due</span><strong>{dueDate}</strong>
            <span>Status</span><strong>{invoice.status}</strong>
          </div>
        </div>
      </header>

      <section className="pdfInfoGrid">
        <div className="pdfInfoBox">
          <div className="pdfLabel">Bill To</div>
          <strong>{invoice.customer || "Customer"}</strong>
          {invoice.customerBusiness && <span>{invoice.customerBusiness}</span>}
          {invoice.customerAddress && <span>{invoice.customerAddress}</span>}
          {[invoice.customerEmail, invoice.customerPhone].filter(Boolean).length > 0 && (
            <span>{[invoice.customerEmail, invoice.customerPhone].filter(Boolean).join(" · ")}</span>
          )}
          <span>{invoice.vehicle || "Vehicle not listed"}</span>
        </div>
        <div className="pdfInfoBox">
          <div className="pdfLabel">Jobs</div>
          {jobs.map((job) => (
            <span key={job.id}>
              <strong>{titleFor(job)}</strong>{vehicleFor(job) ? ` · ${vehicleFor(job)}` : ""}
            </span>
          ))}
        </div>
      </section>

      <table className="pdfTable">
        <thead>
          <tr>
            <th>Product / Service</th>
            <th>Description</th>
            <th className="pdfNum">Qty</th>
            <th className="pdfNum">Rate</th>
            <th className="pdfNum">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td>{lineTypeLabel(line.kind)}</td>
              <td>{line.description || "Line item"}</td>
              <td className="pdfNum">{Number(line.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td className="pdfNum">{money(line.rate)}</td>
              <td className="pdfNum">{money(line.qty * line.rate)}</td>
            </tr>
          ))}
          {invoice.lines.length === 0 && (
            <tr>
              <td>Item</td>
              <td>No line items added</td>
              <td className="pdfNum">0</td>
              <td className="pdfNum">{money(0)}</td>
              <td className="pdfNum">{money(0)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="pdfBottom">
        <div className="pdfNotes">
          <div className="pdfLabel">Message On Invoice</div>
          <p>{invoice.notes || "Thank you for your business."}</p>
          <div className="pdfTerms">
          <div className="pdfLabel">Terms</div>
            <p>{invoice.terms || DEFAULT_TERMS}</p>
          </div>
        </div>
        <div className="pdfTotals">
          <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div><span>Tax ({Number(invoice.taxPercent || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}%)</span><strong>{money(tax)}</strong></div>
          <div className="pdfBalance" style={{ background: `${accent}18` }}><span>Balance Due</span><strong>{money(total)}</strong></div>
        </div>
      </section>

      {invoice.includePhotoPage && (
        <section className="pdfPhotoPage">
          <header className="pdfPhotoHeader" style={{ borderBottomColor: accent }}>
            <div>
              <div className="pdfLabel">Photo Attachment</div>
              <h2>{invoice.photoTitle || "Job Photos"}</h2>
              {invoice.photoNotes && <p>{invoice.photoNotes}</p>}
            </div>
            <div className="pdfPhotoMeta">
              <strong>{invoice.invoiceNumber}</strong>
              <span>{invoice.customer || "Customer"}</span>
            </div>
          </header>
          <div className="pdfPhotoGrid">
            {invoice.photos.map((photo, index) => (
              <figure key={photo.id}>
                {displayPhotoUrl(photo, photoSources) ? (
                  <img src={displayPhotoUrl(photo, photoSources)} alt={photo.caption || photo.name} />
                ) : (
                  <div className="pdfEmptyPhoto">Photo source missing.</div>
                )}
                <figcaption>{photo.caption || `Photo ${index + 1}`}</figcaption>
              </figure>
            ))}
            {invoice.photos.length === 0 && <div className="pdfEmptyPhoto">No photos selected.</div>}
          </div>
        </section>
      )}
    </section>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .layout { width: min(1240px, 100%); margin: 0 auto; }
  .topbar, .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; backdrop-filter: blur(10px); }
  .topbar { padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  p, .panelText { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .lineHead { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .btn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .paid { background: rgba(70,180,115,.18); border-color: rgba(120,235,165,.36); }
  .danger { border-color: rgba(255,90,90,.38); background: rgba(255,90,90,.13); }
  .layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(320px,.34fr); gap: 14px; align-items: start; }
  .panel { padding: 16px; display: grid; gap: 14px; }
  .subPanel { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 12px; display: grid; gap: 10px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .formGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .notes { min-height: 110px; resize: vertical; }
  .shortNotes { min-height: 76px; }
  .customerActions, .vehicleButtons { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .colorInput { height: 44px; padding: 6px; cursor: pointer; }
  .jobPills { display: flex; gap: 8px; flex-wrap: wrap; }
  .jobPill { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 7px 9px; font-size: 12px; font-weight: 950; display: inline-flex; align-items: center; gap: 7px; }
  .jobPill button { border: 0; width: 18px; height: 18px; border-radius: 999px; cursor: pointer; background: rgba(255,255,255,.16); color: #eef1f3; font-weight: 950; line-height: 1; }
  .miniList, .inventoryList { display: grid; gap: 8px; }
  .miniItem { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); color: #eef1f3; border-radius: 10px; padding: 10px; text-align: left; cursor: pointer; display: grid; gap: 3px; }
  .miniItem span, .inventoryItem strong { font-weight: 950; }
  .miniItem small, .inventoryItem small { color: rgba(238,241,243,.68); }
  .inventoryItem { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); border-radius: 10px; padding: 10px; display: grid; grid-template-columns: minmax(0,1fr) 84px 84px auto; gap: 8px; align-items: center; }
  .inventoryItem div { display: grid; gap: 3px; }
  .miniField { display: grid; gap: 5px; }
  .miniField span { color: rgba(238,241,243,.62); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; font-weight: 950; text-align: right; }
  .lineList { --invoice-line-grid: minmax(92px, .72fr) minmax(145px, 1.6fr) minmax(64px, .48fr) minmax(82px, .62fr) minmax(74px, .55fr) minmax(84px, .62fr) minmax(88px, .65fr); display: grid; gap: 9px; min-width: 0; }
  .lineLabels { display: grid; grid-template-columns: var(--invoice-line-grid); gap: 8px; padding: 0 12px; color: rgba(238,241,243,.62); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; font-weight: 950; align-items: end; min-width: 0; }
  .lineLabels span:nth-child(3), .lineLabels span:nth-child(4), .lineLabels span:nth-child(6) { text-align: right; }
  .lineLabels span:nth-child(5), .lineLabels span:nth-child(7) { text-align: center; }
  .lineRow { display: grid; grid-template-columns: var(--invoice-line-grid); gap: 8px; align-items: center; min-width: 0; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 10px; padding: 12px; }
  .lineRow .input, .lineRow .btn, .lineRow .taxToggle { width: 100%; min-width: 0; }
  .lineRow select.input { appearance: none; background-image: linear-gradient(45deg, transparent 50%, rgba(238,241,243,.85) 50%), linear-gradient(135deg, rgba(238,241,243,.85) 50%, transparent 50%); background-position: calc(100% - 18px) 18px, calc(100% - 12px) 18px; background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; padding-right: 32px; }
  .lineRow > strong { text-align: right; white-space: nowrap; font-size: 15px; }
  .num { text-align: right; }
  .kind { padding-left: 9px; padding-right: 8px; }
  .taxToggle { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #eef1f3; border-radius: 9px; padding: 10px 6px; cursor: pointer; font-weight: 950; font-size: 12px; white-space: nowrap; }
  .taxToggle.on { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .summary { position: sticky; top: 14px; }
  .moneyLine { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 10px; padding: 11px 12px; display: flex; justify-content: space-between; gap: 12px; }
  .moneyLine span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .moneyLine.strong { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.22); }
  .moneyLine.strong strong { font-size: 24px; }
  .divider { height: 1px; background: rgba(255,255,255,.1); }
  .invoicePhotoList { display: grid; gap: 10px; }
  .invoicePhotoRow { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); border-radius: 10px; padding: 10px; display: grid; grid-template-columns: 150px minmax(0,1fr); gap: 10px; align-items: start; }
  .invoicePhotoRow img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); }
  .photoMissing { width: 100%; aspect-ratio: 4 / 3; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; display: grid; place-items: center; color: rgba(238,241,243,.68); background: rgba(0,0,0,.24); font-size: 12px; font-weight: 850; text-align: center; padding: 10px; }
  .photoMeta { color: rgba(238,241,243,.68); font-size: 12px; font-weight: 850; margin-bottom: 7px; }
  .photoCaption { min-height: 72px; resize: vertical; margin-bottom: 8px; }
  .emptyPhoto { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 12px; color: rgba(238,241,243,.72); }
  .modalBackdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.58); display: grid; place-items: center; padding: 18px; }
  .photoModal { width: min(980px, 100%); max-height: min(760px, 92vh); overflow: auto; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.78); border-radius: 16px; padding: 16px; display: grid; gap: 14px; backdrop-filter: blur(12px); box-shadow: 0 24px 90px rgba(0,0,0,.38); }
  .sourcePhotoGrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
  .sourcePhoto { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 10px; padding: 8px; display: grid; gap: 7px; text-align: left; cursor: pointer; }
  .sourcePhoto.on { border-color: rgba(160,220,255,.48); background: rgba(120,190,255,.16); }
  .sourcePhoto img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }
  .sourcePhoto span { font-size: 12px; opacity: .78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .modalActions { justify-content: flex-end; }
  .previewPanel { border-top: 1px solid rgba(255,255,255,.1); padding-top: 12px; display: grid; gap: 12px; }
  .previewFrame { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.9); border-radius: 12px; padding: 14px; overflow: auto; }
  .pdfSheet { display: none; }
  .previewFrame .pdfSheet { display: block; min-width: 760px; color: #1f2933; background: #fff; border-radius: 4px; padding: 32px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
  .previewFrame .pdfHeader { display: grid; grid-template-columns: 1fr 220px; gap: 28px; align-items: start; padding-bottom: 28px; border-bottom: 3px solid #2ca01c; }
  .previewFrame .pdfBrandMark { display: inline-block; margin-bottom: 14px; border: 2px solid #111827; padding: 7px 10px; font-size: 13px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #111827; }
  .previewFrame .pdfLogoImage { width: 170px; height: 70px; margin-bottom: 14px; background-size: contain; background-repeat: no-repeat; background-position: left center; }
  .previewFrame .pdfShop { font-size: 19px; font-weight: 800; color: #111827; }
  .previewFrame .pdfTagline { margin-top: 3px; color: #374151; font-size: 12px; font-weight: 700; }
  .previewFrame .pdfMuted { margin-top: 4px; color: #667085; }
  .previewFrame .pdfInvoiceMeta { text-align: right; }
  .previewFrame .pdfInvoiceTitle { font-size: 34px; line-height: 1; text-transform: uppercase; letter-spacing: 1.2px; color: #111827; font-weight: 700; }
  .previewFrame .pdfNumber { margin-top: 8px; color: #2ca01c; font-size: 14px; font-weight: 800; }
  .previewFrame .pdfMetaGrid { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; align-items: center; }
  .previewFrame .pdfMetaGrid span, .previewFrame .pdfLabel { color: #667085; text-transform: uppercase; letter-spacing: .7px; font-size: 9px; font-weight: 800; }
  .previewFrame .pdfMetaGrid strong { color: #111827; text-transform: capitalize; }
  .previewFrame .pdfInfoGrid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; margin: 26px 0; }
  .previewFrame .pdfInfoBox { border: 1px solid #d9dee6; border-radius: 3px; padding: 12px; display: grid; gap: 5px; min-height: 74px; }
  .previewFrame .pdfInfoBox strong { color: #111827; font-size: 13px; }
  .previewFrame .pdfInfoBox span { color: #374151; }
  .previewFrame .pdfTable { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .previewFrame .pdfTable thead th { background: #393a3d; color: #fff; padding: 9px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .45px; text-align: left; }
  .previewFrame .pdfTable th:nth-child(1) { width: 120px; }
  .previewFrame .pdfTable th:nth-child(3) { width: 62px; }
  .previewFrame .pdfTable th:nth-child(4), .previewFrame .pdfTable th:nth-child(5) { width: 92px; }
  .previewFrame .pdfTable tbody td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; vertical-align: top; color: #1f2933; }
  .previewFrame .pdfTable tbody tr:nth-child(even) td { background: #fafafa; }
  .previewFrame .pdfNum { text-align: right !important; white-space: nowrap; }
  .previewFrame .pdfBottom { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 30px; margin-top: 26px; align-items: start; }
  .previewFrame .pdfNotes { color: #374151; }
  .previewFrame .pdfNotes p { margin: 6px 0 0; color: #374151; font-size: 11px; }
  .previewFrame .pdfTerms { margin-top: 18px; }
  .previewFrame .pdfTotals { border-top: 2px solid #393a3d; }
  .previewFrame .pdfTotals div { display: flex; justify-content: space-between; gap: 18px; padding: 9px 0; border-bottom: 1px solid #e5e7eb; }
  .previewFrame .pdfTotals span { color: #374151; }
  .previewFrame .pdfTotals strong { color: #111827; }
  .previewFrame .pdfTotals .pdfBalance { border-bottom: 0; margin-top: 8px; padding: 12px 10px; }
  .previewFrame .pdfBalance span, .previewFrame .pdfBalance strong { font-size: 15px; font-weight: 900; color: #111827; }
  .previewFrame .pdfPhotoPage { margin-top: 38px; padding-top: 26px; border-top: 2px solid #e5e7eb; }
  .previewFrame .pdfPhotoHeader { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid #2ca01c; padding-bottom: 14px; margin-bottom: 18px; }
  .previewFrame .pdfPhotoHeader h2 { color: #111827; font-size: 24px; margin: 4px 0 0; }
  .previewFrame .pdfPhotoHeader p { color: #374151; margin: 6px 0 0; font-size: 11px; }
  .previewFrame .pdfPhotoMeta { display: grid; gap: 4px; text-align: right; align-content: start; color: #374151; }
  .previewFrame .pdfPhotoGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
  .previewFrame figure { margin: 0; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; break-inside: avoid; }
  .previewFrame figure img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; display: block; }
  .previewFrame figcaption { margin-top: 7px; color: #374151; font-size: 11px; line-height: 1.35; }
  .previewFrame .pdfEmptyPhoto { color: #667085; border: 1px solid #e5e7eb; padding: 12px; border-radius: 4px; }
  @media (max-width: 980px) { .topbar, .layout, .lineRow, .inventoryItem, .invoicePhotoRow { display: grid; grid-template-columns: 1fr; } .lineLabels { display: none; } .summary { position: static; } .formGrid { grid-template-columns: 1fr; } .topActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .sourcePhotoGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media print {
    @page { size: letter; margin: 0.45in; }
    body { background: #fff !important; }
    .wrap { min-height: auto; padding: 0; background: #fff !important; color: #1f2933; display: block; }
    .topbar, .layout, .modalBackdrop { display: none !important; }
    .pdfSheet { display: block; color: #1f2933; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
    .pdfHeader { display: grid; grid-template-columns: 1fr 220px; gap: 28px; align-items: start; padding-bottom: 28px; border-bottom: 3px solid #2ca01c; }
    .pdfBrandMark { display: inline-block; margin-bottom: 14px; border: 2px solid #111827; padding: 7px 10px; font-size: 13px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #111827; }
    .pdfLogoImage { width: 170px; height: 70px; margin-bottom: 14px; background-size: contain; background-repeat: no-repeat; background-position: left center; }
    .pdfShop { font-size: 19px; font-weight: 800; color: #111827; }
    .pdfTagline { margin-top: 3px; color: #374151; font-size: 12px; font-weight: 700; }
    .pdfMuted { margin-top: 4px; color: #667085; }
    .pdfInvoiceMeta { text-align: right; }
    .pdfInvoiceTitle { font-size: 34px; line-height: 1; text-transform: uppercase; letter-spacing: 1.2px; color: #111827; font-weight: 700; }
    .pdfNumber { margin-top: 8px; color: #2ca01c; font-size: 14px; font-weight: 800; }
    .pdfMetaGrid { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; align-items: center; }
    .pdfMetaGrid span, .pdfLabel { color: #667085; text-transform: uppercase; letter-spacing: .7px; font-size: 9px; font-weight: 800; }
    .pdfMetaGrid strong { color: #111827; text-transform: capitalize; }
    .pdfInfoGrid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; margin: 26px 0; }
    .pdfInfoBox { border: 1px solid #d9dee6; border-radius: 3px; padding: 12px; display: grid; gap: 5px; min-height: 74px; }
    .pdfInfoBox strong { color: #111827; font-size: 13px; }
    .pdfInfoBox span { color: #374151; }
    .pdfTable { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .pdfTable thead th { background: #393a3d; color: #fff; padding: 9px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .45px; text-align: left; }
    .pdfTable th:nth-child(1) { width: 120px; }
    .pdfTable th:nth-child(3) { width: 62px; }
    .pdfTable th:nth-child(4), .pdfTable th:nth-child(5) { width: 92px; }
    .pdfTable tbody td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; vertical-align: top; color: #1f2933; }
    .pdfTable tbody tr:nth-child(even) td { background: #fafafa; }
    .pdfNum { text-align: right !important; white-space: nowrap; }
    .pdfBottom { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 30px; margin-top: 26px; align-items: start; }
    .pdfNotes { color: #374151; }
    .pdfNotes p { margin: 6px 0 0; color: #374151; font-size: 11px; }
    .pdfTerms { margin-top: 18px; }
    .pdfTotals { border-top: 2px solid #393a3d; }
    .pdfTotals div { display: flex; justify-content: space-between; gap: 18px; padding: 9px 0; border-bottom: 1px solid #e5e7eb; }
    .pdfTotals span { color: #374151; }
    .pdfTotals strong { color: #111827; }
    .pdfTotals .pdfBalance { background: #f3f8f2; border-bottom: 0; margin-top: 8px; padding: 12px 10px; }
    .pdfBalance span, .pdfBalance strong { font-size: 15px; font-weight: 900; color: #111827; }
    .pdfPhotoPage { break-before: page; padding-top: 0; }
    .pdfPhotoHeader { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid #2ca01c; padding-bottom: 14px; margin-bottom: 18px; }
    .pdfPhotoHeader h2 { color: #111827; font-size: 24px; margin: 4px 0 0; }
    .pdfPhotoHeader p { color: #374151; margin: 6px 0 0; font-size: 11px; }
    .pdfPhotoMeta { display: grid; gap: 4px; text-align: right; align-content: start; color: #374151; }
    .pdfPhotoGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    figure { margin: 0; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; break-inside: avoid; page-break-inside: avoid; }
    figure img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; display: block; }
    figcaption { margin-top: 7px; color: #374151; font-size: 11px; line-height: 1.35; }
    .pdfEmptyPhoto { color: #667085; border: 1px solid #e5e7eb; padding: 12px; border-radius: 4px; }
  }
`;
