"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";
import { CUSTOMERS_KEY, INVENTORY_KEY, normalizeServiceCounters, blankCustomer, blankVehicle, type Customer, type CustomerVehicle, type InventoryItem, type ServiceCounter } from "@/lib/setupData";

type CounterId = string;
type Respirator = "none" | "p100" | "p95ov_weldsand" | "p95ov_spray" | "supplied_air";

type Job = {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  customer?: string;
  customerName?: string;
  vehicle?: string | { year?: string; make?: string; model?: string; vin?: string };
  vin?: string;
  status: "active" | "done";
  createdAtISO?: string;
  createdAt?: string;
};

type Settings = {
  [key: string]: unknown;
  jobs?: {
    jobTypes?: string[];
    stages?: string[];
    useChunks?: boolean;
  };
  serviceCounters?: ServiceCounter[];
};

type Session = {
  id: string;
  jobId: string;
  jobName: string;
  startedAt: string;
  startISO: string;
  active: boolean;
  task: string;
  stage: string;
  counters: Record<CounterId, boolean>;
  equipment: {
    booth: boolean;
    devilbiss: boolean;
    respirator: Respirator;
    suppliedAir: boolean;
    compressor: boolean;
  };
  notes: string;
  usedItems: { itemId: string; qty: number }[];
  photos: { name: string; dataUrl: string }[];
  images: { id: string; name: string; dataUrl: string; createdISO: string }[];
  elapsedSec: number;
  totalPausedMs: number;
  pausedAt: string | null;
};

const NEW_CUSTOMER = "__new_customer__";
const NEW_VEHICLE = "__new_vehicle__";
const NEW_JOB_TYPE = "__new_job_type__";
const NEW_STAGE = "__new_stage__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normalizeJobs(raw: unknown): Job[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
    ? raw.items
    : isRecord(raw) && Array.isArray(raw.jobs)
    ? raw.jobs
    : [];

  return list.filter(isRecord).map((rawJob) => ({
    id: String(rawJob.id ?? uid()),
    title: String(rawJob.title ?? rawJob.name ?? "Untitled job"),
    name: String(rawJob.name ?? rawJob.title ?? "Untitled job"),
    type: String(rawJob.type ?? "General Job"),
    customer: typeof rawJob.customer === "string" ? rawJob.customer : undefined,
    customerName: typeof rawJob.customerName === "string" ? rawJob.customerName : undefined,
    vehicle: typeof rawJob.vehicle === "string" || isRecord(rawJob.vehicle) ? rawJob.vehicle as Job["vehicle"] : undefined,
    vin: typeof rawJob.vin === "string" ? rawJob.vin : undefined,
    status: rawJob.status === "done" ? "done" : "active",
    createdAtISO: typeof rawJob.createdAtISO === "string" ? rawJob.createdAtISO : undefined,
    createdAt: typeof rawJob.createdAt === "string" ? rawJob.createdAt : undefined,
  }));
}

function normalizeSessions(raw: unknown): Session[] {
  if (Array.isArray(raw)) return raw as Session[];
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items as Session[];
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions as Session[];
  return [];
}

function normalizeInventory(raw: unknown): InventoryItem[] {
  const list = isRecord(raw) && Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
  return list.filter(isRecord).map((item) => ({
    id: String(item.id ?? uid()),
    name: String(item.name ?? ""),
    category: item.category === "part" ? "part" : "consumable",
    unit: String(item.unit ?? "count"),
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    countingMode: item.countingMode === "scale" ? "scale" : "manual",
    tareWeight: Number.isFinite(Number(item.tareWeight)) ? Number(item.tareWeight) : 0,
    weightPerItem: Number.isFinite(Number(item.weightPerItem)) ? Number(item.weightPerItem) : 0,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
    minThreshold: Number.isFinite(Number(item.minThreshold)) ? Number(item.minThreshold) : 0,
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
  return Boolean(vehicle.year || vehicle.make || vehicle.model || vehicle.paint || vehicle.vin || vehicle.plate || vehicle.notes || vehicle.tags.length);
}

function normalizeCustomer(raw: Partial<Customer>): Customer {
  const blank = blankCustomer();
  const legacyVehicle = normalizeVehicle(raw.vehicle);
  const vehicles = Array.isArray(raw.vehicles) && raw.vehicles.length
    ? raw.vehicles.map((vehicle) => normalizeVehicle(vehicle))
    : [legacyVehicle];

  return {
    ...blank,
    ...raw,
    business: raw.business ?? "",
    preferredContact: raw.preferredContact ?? "any",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    vehicle: vehicles[0],
    vehicles: vehicles.some(vehicleHasContent) ? vehicles : [legacyVehicle],
  };
}

function normalizeCustomers(raw: unknown): Customer[] {
  const list = isRecord(raw) && Array.isArray(raw.customers) ? raw.customers : Array.isArray(raw) ? raw : [];
  return list.filter(isRecord).map((customer) => normalizeCustomer(customer));
}

function saveCustomers(customers: Customer[]) {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify({ customers, meta: { savedAt: new Date().toISOString() } }));
}

function jobTitle(job: Job) {
  return job.title || job.name || "Untitled job";
}

function jobCustomer(job: Job) {
  return job.customer || job.customerName || "";
}

function vehicleLabel(job: Job) {
  if (typeof job.vehicle === "string") return job.vehicle;
  if (job.vehicle && typeof job.vehicle === "object") {
    return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
  }
  return "";
}

function vehicleTitle(vehicle: CustomerVehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

function cleanVehicle(vehicle: CustomerVehicle): CustomerVehicle {
  return {
    ...vehicle,
    year: vehicle.year.trim(),
    make: vehicle.make.trim(),
    model: vehicle.model.trim(),
    paint: vehicle.paint.trim(),
    vin: vehicle.vin.trim(),
    plate: vehicle.plate.trim(),
    notes: vehicle.notes.trim(),
    tags: vehicle.tags.map((tag) => tag.trim()).filter(Boolean),
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export default function ClockInPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [plannedItems, setPlannedItems] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobType, setJobType] = useState("General Job");
  const [customJobType, setCustomJobType] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerBusiness, setNewCustomerBusiness] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newVehicle, setNewVehicle] = useState<CustomerVehicle>(() => blankVehicle());
  const [stage, setStage] = useState("Work");
  const [customStage, setCustomStage] = useState("");
  const [counters, setCounters] = useState<Record<CounterId, boolean>>({
    spray_hours: true,
    supplied_air_hours: true,
    weld_sand_hours: false,
  });
  const serviceCounters = useMemo(() => normalizeServiceCounters(settings?.serviceCounters), [settings?.serviceCounters]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loadedSettings = loadJSON<Settings | null>(KEYS.settings, null);
      const loadedJobs = normalizeJobs(loadJSON<unknown>(KEYS.jobs, []));
      const loadedCustomers = normalizeCustomers(loadJSON<unknown>(CUSTOMERS_KEY, { customers: [] }));
      const loadedInventory = normalizeInventory(loadJSON<unknown>(INVENTORY_KEY, { items: [] }));
      setSettings(loadedSettings);
      const loadedCounters = normalizeServiceCounters(loadedSettings?.serviceCounters);
      setCounters((current) => ({
        ...Object.fromEntries(loadedCounters.map((counter) => [counter.id, false])),
        ...current,
      }));
      setJobs(loadedJobs);
      setCustomers(loadedCustomers);
      setInventory(loadedInventory);
      setSelectedJobId((current) => current || loadedJobs.find((job) => job.status !== "done")?.id || "");
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const jobTypes = useMemo(
    () => (settings?.jobs?.jobTypes?.length ? settings.jobs.jobTypes : ["General Job"]),
    [settings]
  );
  const stages = useMemo(
    () => (settings?.jobs?.stages?.length ? settings.jobs.stages : ["Work"]),
    [settings]
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      setJobType((current) => (jobTypes.includes(current) ? current : jobTypes[0]));
      setStage((current) => (stages.includes(current) ? current : stages[0]));
    }, 0);
    return () => window.clearTimeout(id);
  }, [jobTypes, stages]);

  const activeJobs = useMemo(() => jobs.filter((job) => job.status !== "done"), [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeJobs;
    return activeJobs.filter((job) =>
      `${jobTitle(job)} ${job.type ?? ""} ${jobCustomer(job)} ${vehicleLabel(job)} ${job.vin ?? ""}`.toLowerCase().includes(q)
    );
  }, [activeJobs, search]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) => `${item.name} ${item.category} ${item.unit}`.toLowerCase().includes(q));
  }, [inventory, inventorySearch]);

  const plannedUsedItems = useMemo(
    () =>
      Object.entries(plannedItems)
        .map(([itemId, qty]) => ({ itemId, qty: Number(qty) || 0 }))
        .filter((item) => item.qty > 0),
    [plannedItems]
  );

  const plannedTotal = useMemo(
    () =>
      plannedUsedItems.reduce((sum, planned) => {
        const item = inventory.find((inventoryItem) => inventoryItem.id === planned.itemId);
        return sum + planned.qty * (item?.unitPrice ?? 0);
      }, 0),
    [inventory, plannedUsedItems]
  );

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const canClockIn = mode === "existing" ? Boolean(selectedJob) : jobName.trim().length > 0;
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );
  const selectedVehicle = useMemo(
    () => selectedCustomer?.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedCustomer, selectedVehicleId]
  );
  const shouldShowNewCustomer = selectedCustomerId === NEW_CUSTOMER;
  const shouldShowNewVehicle = selectedCustomerId !== "" && (selectedCustomerId === NEW_CUSTOMER || selectedVehicleId === NEW_VEHICLE);

  const setPlannedQty = (itemId: string, qty: number) => {
    setPlannedItems((current) => {
      const next = { ...current };
      if (qty > 0) next[itemId] = qty;
      else delete next[itemId];
      return next;
    });
  };

  const saveJobs = (next: Job[]) => {
    setJobs(next);
    saveJSON(KEYS.jobs, next);
  };

  const resolveJobType = () => {
    if (jobType !== NEW_JOB_TYPE) return jobType;
    return customJobType.trim() || "Custom Job";
  };

  const resolveStage = () => {
    if (stage !== NEW_STAGE) return stage;
    return customStage.trim() || "Custom Stage";
  };

  const saveWorkflowChoice = ({ type, stageName }: { type?: string; stageName?: string }) => {
    const cleanType = type?.trim();
    const cleanStage = stageName?.trim();
    const nextJobTypes = cleanType && !jobTypes.includes(cleanType) ? [...jobTypes, cleanType] : jobTypes;
    const nextStages = cleanStage && !stages.includes(cleanStage) ? [...stages, cleanStage] : stages;

    if (nextJobTypes === jobTypes && nextStages === stages) return;

    const nextSettings: Settings = {
      ...(settings ?? {}),
      jobs: {
        ...(settings?.jobs ?? {}),
        jobTypes: nextJobTypes,
        stages: nextStages,
      },
    };
    setSettings(nextSettings);
    saveJSON(KEYS.settings, nextSettings);
  };

  const saveCustomJobType = (type: string) => {
    const cleanType = type.trim();
    if (!cleanType || jobTypes.includes(cleanType)) return cleanType;
    saveWorkflowChoice({ type: cleanType });
    return cleanType;
  };

  const saveCustomStage = (stageName: string) => {
    const cleanStage = stageName.trim();
    if (!cleanStage || stages.includes(cleanStage)) return cleanStage;
    saveWorkflowChoice({ stageName: cleanStage });
    return cleanStage;
  };

  const saveCustomerSelection = () => {
    let nextCustomers = customers;
    let customerName = "";
    let vehicleText = "";
    let vehicleVin = "";
    const cleanedVehicle = cleanVehicle(newVehicle);
    const hasNewVehicle = vehicleHasContent(cleanedVehicle);

    if (selectedCustomerId === NEW_CUSTOMER) {
      const cleanName = newCustomerName.trim();
      const cleanBusiness = newCustomerBusiness.trim();
      if (cleanName || cleanBusiness || newCustomerPhone.trim() || newCustomerEmail.trim()) {
        const customer = normalizeCustomer({
          ...blankCustomer(),
          name: cleanName,
          business: cleanBusiness,
          phone: newCustomerPhone.trim(),
          email: newCustomerEmail.trim(),
          vehicles: hasNewVehicle ? [cleanedVehicle] : [blankVehicle()],
        });
        nextCustomers = [customer, ...customers];
        customerName = customer.name || customer.business;
        if (hasNewVehicle) {
          vehicleText = vehicleTitle(cleanedVehicle);
          vehicleVin = cleanedVehicle.vin;
        }
      }
    } else if (selectedCustomer) {
      customerName = selectedCustomer.name || selectedCustomer.business;
      if (selectedVehicle) {
        vehicleText = vehicleTitle(selectedVehicle);
        vehicleVin = selectedVehicle.vin;
      } else if (selectedVehicleId === NEW_VEHICLE && hasNewVehicle) {
        const updatedCustomer = normalizeCustomer({
          ...selectedCustomer,
          vehicles: [...selectedCustomer.vehicles, cleanedVehicle],
        });
        nextCustomers = customers.map((customer) => (customer.id === selectedCustomer.id ? updatedCustomer : customer));
        vehicleText = vehicleTitle(cleanedVehicle);
        vehicleVin = cleanedVehicle.vin;
      }
    } else if (hasNewVehicle) {
      vehicleText = vehicleTitle(cleanedVehicle);
      vehicleVin = cleanedVehicle.vin;
    }

    if (nextCustomers !== customers) {
      setCustomers(nextCustomers);
      saveCustomers(nextCustomers);
    }

    return { customerName, vehicleText, vehicleVin };
  };

  const createJob = () => {
    const title = jobName.trim();
    if (!title) return null;
    const now = new Date().toISOString();
    const linked = saveCustomerSelection();
    const finalJobType = saveCustomJobType(resolveJobType());
    const job: Job = {
      id: uid(),
      title,
      name: title,
      type: finalJobType,
      customer: linked.customerName || undefined,
      customerName: linked.customerName || undefined,
      vehicle: linked.vehicleText || undefined,
      vin: linked.vehicleVin || undefined,
      status: "active",
      createdAtISO: now,
      createdAt: now,
    };
    saveJobs([job, ...jobs]);
    return job;
  };

  const createSession = (job: Job) => {
    const now = new Date().toISOString();
    const finalStage = saveCustomStage(resolveStage());
    const session: Session = {
      id: uid(),
      jobId: job.id,
      jobName: jobTitle(job),
      startedAt: now,
      startISO: now,
      active: true,
      task: finalStage,
      stage: finalStage,
      counters,
      equipment: {
        booth: Boolean(counters.spray_hours),
        devilbiss: false,
        respirator: counters.supplied_air_hours ? "supplied_air" : counters.weld_sand_hours ? "p100" : counters.spray_hours ? "p95ov_spray" : "none",
        suppliedAir: Boolean(counters.supplied_air_hours),
        compressor: counters.supplied_air_hours,
      },
      notes: "",
      usedItems: plannedUsedItems,
      photos: [],
      images: [],
      elapsedSec: 0,
      totalPausedMs: 0,
      pausedAt: null,
    };

    const sessions = normalizeSessions(loadJSON<unknown>(KEYS.sessions, []));
    saveJSON(KEYS.sessions, [session, ...sessions]);
    router.push(`/session/${session.id}`);
  };

  const clockIn = () => {
    const job = mode === "existing" ? selectedJob : createJob();
    if (!job) return;
    createSession(job);
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/marshall-os.svg" alt="MARshall OS" />
          <div>
            <div className="micro">CLOCK IN</div>
            <h1>Start Work</h1>
          </div>
        </div>
        <div className="topActions">
          <Link className="btn ghost" href="/jobs">Jobs</Link>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <div className="workspace">
        <section className="panel jobPanel">
          <div className="panelTop">
            <div>
              <div className="title">Job</div>
              <div className="hint">Continue an active job or create one before the timer starts.</div>
            </div>
            <div className="seg">
              <button className={mode === "existing" ? "on" : ""} onClick={() => setMode("existing")}>Existing</button>
              <button className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>New</button>
            </div>
          </div>

          {mode === "existing" ? (
            <>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs, customers, vehicles..." />
              <div className="jobList">
                {filteredJobs.length === 0 ? (
                  <div className="empty">No active jobs yet. Switch to New to create one.</div>
                ) : (
                  filteredJobs.map((job) => (
                    <button key={job.id} className={`jobRow ${selectedJobId === job.id ? "selected" : ""}`} onClick={() => setSelectedJobId(job.id)}>
                      <div className="jobLine">
                        <strong>{jobTitle(job)}</strong>
                        <span>{job.type}</span>
                      </div>
                      <div className="metaLine">
                        {jobCustomer(job) && <span>{jobCustomer(job)}</span>}
                        {vehicleLabel(job) && <span>{vehicleLabel(job)}</span>}
                        {job.vin && <span>VIN {job.vin}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="formGrid">
              <label className="label full">Job name<input className="input" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Example: F-250 cab repaint" /></label>
              <label className="label">
                Job type
                <select className="input" value={jobType} onChange={(event) => setJobType(event.target.value)}>
                  {jobTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  <option value={NEW_JOB_TYPE}>Add new job type</option>
                </select>
              </label>
              {jobType === NEW_JOB_TYPE && (
                <label className="label">
                  New job type
                  <input className="input" value={customJobType} onChange={(event) => setCustomJobType(event.target.value)} placeholder="Example: Frame repair" />
                </label>
              )}
              <label className="label">
                Customer
                <select
                  className="input"
                  value={selectedCustomerId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextCustomer = customers.find((customer) => customer.id === nextId);
                    const firstVehicleId = nextCustomer?.vehicles.find(vehicleHasContent)?.id;
                    setSelectedCustomerId(nextId);
                    setSelectedVehicleId(firstVehicleId ?? (nextId === NEW_CUSTOMER || nextCustomer ? NEW_VEHICLE : ""));
                  }}
                >
                  <option value="">No customer yet</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name || customer.business || "Unnamed customer"}</option>
                  ))}
                  <option value={NEW_CUSTOMER}>Add new customer</option>
                </select>
              </label>

              {selectedCustomer && (
                <label className="label">
                  Vehicle
                  <select className="input" value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>
                    {selectedCustomer.vehicles.filter(vehicleHasContent).map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>{vehicleTitle(vehicle) || vehicle.vin || vehicle.plate || "Untitled vehicle"}</option>
                    ))}
                    <option value={NEW_VEHICLE}>Add new vehicle</option>
                  </select>
                </label>
              )}

              {shouldShowNewCustomer && (
                <>
                  <label className="label">Customer name<input className="input" value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} placeholder="Customer name" /></label>
                  <label className="label">Business<input className="input" value={newCustomerBusiness} onChange={(event) => setNewCustomerBusiness(event.target.value)} placeholder="Optional" /></label>
                  <label className="label">Phone<input className="input" value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} placeholder="270-000-0000" /></label>
                  <label className="label">Email<input className="input" value={newCustomerEmail} onChange={(event) => setNewCustomerEmail(event.target.value)} placeholder="customer@email.com" /></label>
                </>
              )}

              {(selectedCustomerId === "" || shouldShowNewVehicle) && (
                <>
                  <div className="sectionTitle full">Vehicle</div>
                  <label className="label">Year<input className="input" value={newVehicle.year} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, year: event.target.value }))} placeholder="2002" /></label>
                  <label className="label">Make<input className="input" value={newVehicle.make} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, make: event.target.value }))} placeholder="Ford" /></label>
                  <label className="label">Model<input className="input" value={newVehicle.model} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, model: event.target.value }))} placeholder="F-250" /></label>
                  <label className="label">Paint<input className="input" value={newVehicle.paint} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, paint: event.target.value }))} placeholder="Paint code / color" /></label>
                  <label className="label">VIN<input className="input" value={newVehicle.vin} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, vin: event.target.value }))} placeholder="Optional" /></label>
                  <label className="label">Plate<input className="input" value={newVehicle.plate} onChange={(event) => setNewVehicle((vehicle) => ({ ...vehicle, plate: event.target.value }))} placeholder="Optional" /></label>
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel sessionPanel">
          <div>
            <div className="title">Session</div>
            <div className="hint">Pick the stage and active hour counters. These choices drive reminder tracking.</div>
          </div>

          <label className="label">
            Current stage
            <select className="input" value={stage} onChange={(event) => setStage(event.target.value)}>
              {stages.map((item) => <option key={item} value={item}>{item}</option>)}
              <option value={NEW_STAGE}>Add new stage</option>
            </select>
          </label>
          {stage === NEW_STAGE && (
            <label className="label">
              New stage
              <input className="input" value={customStage} onChange={(event) => setCustomStage(event.target.value)} placeholder="Example: Masking" />
            </label>
          )}

          <div className="divider" />
          <div className="sectionTitle">Hour Counters</div>
          <div className="toggleGrid">
            {serviceCounters.map((counter) => (
              <Toggle key={counter.id} label={counter.name} value={Boolean(counters[counter.id])} onChange={(value) => setCounters((current) => ({ ...current, [counter.id]: value }))} />
            ))}
          </div>

          <div className="divider" />
          <div className="sectionTitle">Starting Inventory</div>
          <div className="hint">Add what you expect to use. You can adjust it on the session page before final review.</div>

          <input
            className="input"
            value={inventorySearch}
            onChange={(event) => setInventorySearch(event.target.value)}
            placeholder="Search inventory..."
          />

          <div className="inventoryPickList">
            {filteredInventory.slice(0, 12).map((item) => (
              <div className="inventoryPick" key={item.id}>
                <div className="inventoryMain">
                  <strong>{item.name || "Unnamed item"}</strong>
                  <span>{item.quantity} {item.unit} on hand - {money(item.unitPrice)} / {item.unit}</span>
                </div>
                <DecimalInput
                  className="qty"
                  value={plannedItems[item.id] ?? ""}
                  onValueChange={(value) => setPlannedQty(item.id, value)}
                  placeholder="0"
                />
              </div>
            ))}
            {inventory.length === 0 && <div className="empty">No inventory set up yet.</div>}
            {inventory.length > 0 && filteredInventory.length === 0 && <div className="empty">No inventory items match.</div>}
          </div>

          <div className="summary">
            <div className="micro">READY</div>
            <strong>{mode === "existing" ? selectedJob ? jobTitle(selectedJob) : "Choose a job" : jobName || "New job"}</strong>
            <span>{resolveStage()} - {Object.values(counters).filter(Boolean).length} active counter(s)</span>
            {plannedUsedItems.length > 0 && <span>{plannedUsedItems.length} material line(s) - {money(plannedTotal)} estimated</span>}
          </div>

          <button className="btn primary big" disabled={!canClockIn} onClick={clockIn}>Clock In</button>
        </section>
      </div>

      <style jsx global>{styles}</style>
    </main>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>
      <span className="dot" />
      <span>{label}</span>
    </button>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 22px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 16px; align-content: start; }
  .topbar, .workspace { width: min(1180px, 100%); margin: 0 auto; }
  .topbar { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 16px; padding: 14px 16px; backdrop-filter: blur(8px); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .logo { height: 48px; width: auto; filter: drop-shadow(0 8px 16px rgba(0,0,0,.45)); }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 2px 0 0; font-size: 34px; line-height: 1; }
  .topActions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, .85fr); gap: 14px; align-items: start; }
  .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4); border-radius: 16px; padding: 16px; backdrop-filter: blur(8px); box-shadow: 0 18px 60px rgba(0,0,0,.22); display: grid; gap: 14px; min-width: 0; }
  .sessionPanel { position: sticky; top: 16px; }
  .panelTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .title { font-size: 20px; font-weight: 1000; }
  .hint { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin-top: 4px; }
  .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .ghost { background: rgba(255,255,255,.05); }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .big { min-height: 48px; font-size: 16px; }
  button:disabled { opacity: .48; cursor: not-allowed; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.055); border-radius: 999px; overflow: hidden; }
  .seg button { border: 0; background: transparent; color: #eef1f3; padding: 9px 13px; cursor: pointer; font-weight: 950; }
  .seg .on { background: rgba(255,255,255,.15); }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .full { grid-column: 1 / -1; }
  .jobList { display: grid; gap: 10px; max-height: calc(100vh - 260px); overflow: auto; padding-right: 4px; }
  .jobRow { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 13px; display: grid; gap: 7px; text-align: left; cursor: pointer; }
  .jobRow:hover, .jobRow.selected { background: rgba(255,255,255,.13); border-color: rgba(255,255,255,.28); }
  .jobLine, .metaLine { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .jobLine span, .metaLine span { border: 1px solid rgba(255,255,255,.13); background: rgba(0,0,0,.22); border-radius: 999px; padding: 5px 8px; font-size: 12px; color: rgba(238,241,243,.78); }
  .empty { color: rgba(238,241,243,.72); border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 8px; padding: 14px; font-size: 13px; }
  .divider { height: 1px; background: rgba(255,255,255,.1); }
  .sectionTitle { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 1000; opacity: .72; }
  .toggleGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .toggle { min-height: 50px; text-align: left; display: flex; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 12px; cursor: pointer; font-weight: 900; }
  .dot { width: 10px; height: 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); flex: 0 0 auto; }
  .toggle.on { background: rgba(255,255,255,.13); border-color: rgba(255,255,255,.25); }
  .toggle.on .dot { background: rgba(255,255,255,.85); }
  .inventoryPickList { display: grid; gap: 8px; max-height: 260px; overflow: auto; padding-right: 4px; }
  .inventoryPick { display: grid; grid-template-columns: minmax(0, 1fr) 76px; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.045); border-radius: 8px; padding: 10px; }
  .inventoryMain { display: grid; gap: 4px; min-width: 0; }
  .inventoryMain strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inventoryMain span { color: rgba(238,241,243,.68); font-size: 12px; line-height: 1.25; }
  .qty { width: 76px; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 10px; outline: none; text-align: right; font-weight: 950; }
  .summary { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 13px; display: grid; gap: 5px; }
  .summary strong { font-size: 16px; }
  .summary span { color: rgba(238,241,243,.72); font-size: 13px; }
  @media (max-width: 980px) { .wrap { padding: 14px; } .topbar, .workspace, .panelTop { display: grid; } .workspace, .formGrid, .toggleGrid { grid-template-columns: 1fr; } .sessionPanel { position: static; } .topActions { justify-content: stretch; } .btn { flex: 1 1 auto; } .jobList, .inventoryPickList { max-height: none; } }
`;
