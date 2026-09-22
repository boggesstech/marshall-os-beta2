"use client";

import type { WallpaperId } from "@/components/ApplyWallpaper";

export const SETTINGS_KEY = "marshall_settings_v1";
export const INVENTORY_KEY = "marshall_inventory_v1";
export const CUSTOMERS_KEY = "marshall_customers_v1";
export const COMPLETE_KEY = "marshall_setupComplete";

export const SOUND_CHOICES = [
  { id: "s1", name: "Soft Ping", url: "/sounds/ping1.mp3" },
  { id: "s2", name: "Digital Click", url: "/sounds/click1.mp3" },
  { id: "s3", name: "Chime", url: "/sounds/chime1.mp3" },
  { id: "s4", name: "Beep", url: "/sounds/beep1.mp3" },
  { id: "s5", name: "Alert", url: "/sounds/alert1.mp3" },
] as const;

export type SoundId = (typeof SOUND_CHOICES)[number]["id"];

export const COUNTERS = [
  { id: "spray_hours", name: "Spray hours" },
  { id: "supplied_air_hours", name: "Supplied-air hours" },
  { id: "weld_sand_hours", name: "Weld/Sand hours" },
] as const;

export type ServiceCounter = { id: string; name: string };
export type CounterId = string;
export type TriggerType = "hours" | "days" | "months" | "manual_date";
export type InventoryMode = "skip" | "later" | "now";
export type MaterialBillingMode = "none" | "percent" | "all";

export type LaborBillingSettings = {
  enabled: boolean;
  hourlyRate: number;
  minimumHours: number;
  billingIncrementMinutes: number;
  includeMaterials: boolean;
  materialBillingMode: MaterialBillingMode;
  materialBillingPercent: number;
  countMaterialsAsExpense: boolean;
  materialMarkupPercent: number;
  taxPercent: number;
  laborLabel: string;
};

export type Reminder = {
  id: string;
  name: string;
  category: "Respirator" | "Booth" | "Air System" | "Compressor" | "Other";
  enabled: boolean;
  trigger: TriggerType;
  limitValue: number;
  warnValue: number;
  counterId?: CounterId;
  lastCounterValue?: number;
  lastServicedAtISO?: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: "consumable" | "part";
  unit: string;
  unitPrice: number;
  countingMode: "manual" | "scale";
  tareWeight: number;
  weightPerItem: number;
  quantity: number;
  minThreshold: number;
};

export type Customer = {
  id: string;
  name: string;
  business: string;
  phone: string;
  email: string;
  address: string;
  preferredContact: "phone" | "text" | "email" | "any";
  notes: string;
  tags: string[];
  vehicle: CustomerVehicle;
  vehicles: CustomerVehicle[];
  createdAt: string;
};

export type CustomerVehicle = {
  id: string;
  make: string;
  model: string;
  year: string;
  paint: string;
  vin: string;
  plate: string;
  notes: string;
  tags: string[];
};

export type Settings = {
  user: { name: string; email?: string; phone?: string };
  shop: { name: string; business?: string; timezone: string; alertEmails: string[]; logoDataUrl?: string };
  customers: {
    enabled: boolean;
    allowJobCustomerLinking: boolean;
    requireCustomerOnJobs: boolean;
  };
  reminders: Reminder[];
  serviceCounters: ServiceCounter[];
  jobs: {
    jobTypes: string[];
    stages: string[];
    useChunks: boolean;
  };
  inventory: {
    enabled: boolean;
    enableConsumables: boolean;
    enableParts: boolean;
    mode: InventoryMode;
  };
  billing: {
    labor: LaborBillingSettings;
  };
  ui: {
    wallpaper: WallpaperId;
    sound: SoundId;
  };
  meta: { createdAt: string };
};

export const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

export const n = (raw: string) => {
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
};

export const DEFAULT_LABOR_BILLING: LaborBillingSettings = {
  enabled: false,
  hourlyRate: 0,
  minimumHours: 0,
  billingIncrementMinutes: 15,
  includeMaterials: true,
  materialBillingMode: "all",
  materialBillingPercent: 100,
  countMaterialsAsExpense: true,
  materialMarkupPercent: 0,
  taxPercent: 0,
  laborLabel: "Labor",
};

export const parseEmails = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function blankCustomer(): Customer {
  const vehicle = blankVehicle();
  return {
    id: uid(),
    name: "",
    business: "",
    phone: "",
    email: "",
    address: "",
    preferredContact: "any",
    notes: "",
    tags: [],
    vehicle,
    vehicles: [vehicle],
    createdAt: new Date().toISOString(),
  };
}

export function blankVehicle(): CustomerVehicle {
  return {
    id: uid(),
    make: "",
    model: "",
    year: "",
    paint: "",
    vin: "",
    plate: "",
    notes: "",
    tags: [],
  };
}

export const DEFAULT_JOB_TYPES = [
  "Full Repaint",
  "Panel Repair",
  "Rust Repair",
  "Bumper Repair",
  "Insurance Job",
];

export const DEFAULT_STAGES = [
  "Intake",
  "Disassembly",
  "Strip",
  "Rust Mort",
  "Metal Work",
  "Epoxy Prime",
  "Body Filler",
  "High Build Primer",
  "Block Sand",
  "Sealer",
  "Paint",
  "Clear",
  "Wet Sand",
  "Buff",
  "Final Assembly",
  "Delivery",
];

export function defaultInventoryItems(): InventoryItem[] {
  return [
    {
      id: uid(),
      name: "Bondo spreaders",
      category: "consumable",
      unit: "count",
      unitPrice: 0,
      countingMode: "scale",
      tareWeight: 120,
      weightPerItem: 6,
      quantity: 0,
      minThreshold: 25,
    },
  ];
}

export function defaultReminders(): Reminder[] {
  return [
    {
      id: uid(),
      name: "P100 Filters (Sanding filler / Sanding paint)",
      category: "Respirator",
      enabled: true,
      trigger: "hours",
      limitValue: 40,
      warnValue: 5,
      counterId: "weld_sand_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "P100 Filters (30-day limit)",
      category: "Respirator",
      enabled: true,
      trigger: "days",
      limitValue: 30,
      warnValue: 5,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "P95+OV Filters (Weld/Sand) - Hours",
      category: "Respirator",
      enabled: true,
      trigger: "hours",
      limitValue: 40,
      warnValue: 5,
      counterId: "weld_sand_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "P95+OV Filters (Weld/Sand) - 30-day limit",
      category: "Respirator",
      enabled: true,
      trigger: "days",
      limitValue: 30,
      warnValue: 5,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "P95+OV Filters (Spray) - Hours",
      category: "Respirator",
      enabled: true,
      trigger: "hours",
      limitValue: 20,
      warnValue: 5,
      counterId: "spray_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "P95+OV Filters (Spray) - 30-day limit",
      category: "Respirator",
      enabled: true,
      trigger: "days",
      limitValue: 30,
      warnValue: 5,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Supplied-Air Respirator Filter",
      category: "Respirator",
      enabled: true,
      trigger: "months",
      limitValue: 12,
      warnValue: 2,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Supplied-Air Compressor Service @ 200 hours",
      category: "Respirator",
      enabled: true,
      trigger: "hours",
      limitValue: 200,
      warnValue: 10,
      counterId: "supplied_air_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Supplied-Air Compressor Service @ 400 hours",
      category: "Respirator",
      enabled: true,
      trigger: "hours",
      limitValue: 400,
      warnValue: 10,
      counterId: "supplied_air_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Booth Intake/Exhaust Filters",
      category: "Booth",
      enabled: true,
      trigger: "hours",
      limitValue: 100,
      warnValue: 10,
      counterId: "spray_hours",
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Booth Inspection",
      category: "Booth",
      enabled: true,
      trigger: "months",
      limitValue: 12,
      warnValue: 1,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Booth Fire Suppression Inspection",
      category: "Booth",
      enabled: true,
      trigger: "months",
      limitValue: 6,
      warnValue: 1,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Devilbiss Clean Air System Filter",
      category: "Air System",
      enabled: true,
      trigger: "months",
      limitValue: 6,
      warnValue: 1,
      lastServicedAtISO: todayISO(),
    },
    {
      id: uid(),
      name: "Air Compressor Oil Change",
      category: "Compressor",
      enabled: true,
      trigger: "months",
      limitValue: 12,
      warnValue: 1,
      lastServicedAtISO: todayISO(),
    },
  ];
}

export function loadSetupSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSetupSettings(JSON.parse(raw) as Settings) : null;
  } catch {
    return null;
  }
}

export function saveSetupSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSetupSettings(settings)));
}

export function normalizeSetupSettings(settings: Settings): Settings {
  return {
    ...settings,
    serviceCounters: normalizeServiceCounters(settings.serviceCounters),
    billing: {
      ...settings.billing,
      labor: {
        ...DEFAULT_LABOR_BILLING,
        ...(settings.billing?.labor ?? {}),
      },
    },
  };
}

export function normalizeServiceCounters(counters?: ServiceCounter[]) {
  const merged = [...COUNTERS, ...(Array.isArray(counters) ? counters : [])];
  const seen = new Set<string>();
  return merged
    .map((counter) => ({
      id: String(counter.id ?? "").trim(),
      name: String(counter.name ?? "").trim(),
    }))
    .filter((counter) => counter.id && counter.name)
    .filter((counter) => {
      if (seen.has(counter.id)) return false;
      seen.add(counter.id);
      return true;
    });
}

export function defaultSetupSettings(timezone = "UTC"): Settings {
  return {
    user: { name: "User" },
    shop: {
      name: "MAR Shop",
      business: "MAR Shop",
      timezone,
      alertEmails: [],
      logoDataUrl: "",
    },
    customers: {
      enabled: true,
      allowJobCustomerLinking: true,
      requireCustomerOnJobs: false,
    },
    reminders: defaultReminders(),
    serviceCounters: normalizeServiceCounters(),
    jobs: {
      jobTypes: DEFAULT_JOB_TYPES,
      stages: DEFAULT_STAGES,
      useChunks: true,
    },
    inventory: {
      enabled: false,
      enableConsumables: true,
      enableParts: true,
      mode: "skip",
    },
    billing: {
      labor: DEFAULT_LABOR_BILLING,
    },
    ui: {
      wallpaper: "w1",
      sound: "s1",
    },
    meta: { createdAt: new Date().toISOString() },
  };
}
