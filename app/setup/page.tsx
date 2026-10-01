"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper, { WALLPAPERS, type WallpaperId } from "@/components/ApplyWallpaper";
import DecimalInput from "@/components/DecimalInput";
import {
  COMPLETE_KEY,
  COUNTERS,
  DEFAULT_JOB_TYPES,
  DEFAULT_LABOR_BILLING,
  DEFAULT_STAGES,
  INVENTORY_KEY,
  SOUND_CHOICES,
  type MaterialBillingMode,
  type InventoryItem,
  type Reminder,
  type SoundId,
  defaultInventoryItems,
  defaultReminders,
  loadSetupSettings,
  parseEmails,
  saveSetupSettings,
  uid,
  type Settings,
} from "@/lib/setupData";

type SetupChoice = "skip" | "setup";
type ServiceMode = "default" | "custom";
type ResourceSeed = {
  id: string;
  title: string;
  category: "TDS" | "SDS" | "Safety" | "Equipment" | "Paint" | "Workflow" | "Internal" | "Other";
  type: "pdf" | "video" | "website" | "sheet" | "note" | "internal";
  url: string;
  fileName: string;
  tags: string;
  notes: string;
};

const steps = ["Start", "Account", "Service", "Inventory", "Jobs", "Invoice", "Resources", "Style", "Ready"];
const RESOURCES_KEY = "marshall_resources_v2";
const INVOICE_SETUP_KEY = "marshall_invoice_setup_v1";

export default function SetupPage() {
  const router = useRouter();
  const tzDefault = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [shopName, setShopName] = useState("Miles Auto Refinishing");
  const [shopLogo, setShopLogo] = useState("");
  const [timezone, setTimezone] = useState(tzDefault);
  const [alertEmailsRaw, setAlertEmailsRaw] = useState("");

  const [laborEnabled, setLaborEnabled] = useState(false);
  const [laborRate, setLaborRate] = useState(DEFAULT_LABOR_BILLING.hourlyRate);
  const [minimumHours, setMinimumHours] = useState(DEFAULT_LABOR_BILLING.minimumHours);
  const [billingIncrementMinutes, setBillingIncrementMinutes] = useState(DEFAULT_LABOR_BILLING.billingIncrementMinutes);
  const [materialBillingMode, setMaterialBillingMode] = useState<MaterialBillingMode>(DEFAULT_LABOR_BILLING.materialBillingMode);
  const [materialBillingPercent, setMaterialBillingPercent] = useState(DEFAULT_LABOR_BILLING.materialBillingPercent);
  const [materialMarkupPercent, setMaterialMarkupPercent] = useState(DEFAULT_LABOR_BILLING.materialMarkupPercent);
  const [countMaterialsAsExpense, setCountMaterialsAsExpense] = useState(DEFAULT_LABOR_BILLING.countMaterialsAsExpense);
  const [taxPercent, setTaxPercent] = useState(DEFAULT_LABOR_BILLING.taxPercent);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("default");
  const [reminders, setReminders] = useState<Reminder[]>(() => defaultReminders());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => defaultInventoryItems());
  const [jobTypes, setJobTypes] = useState<string[]>(DEFAULT_JOB_TYPES);
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [jobTypeDraft, setJobTypeDraft] = useState("");
  const [stageDraft, setStageDraft] = useState("");
  const [invoiceDueDays, setInvoiceDueDays] = useState(14);
  const [invoiceTerms, setInvoiceTerms] = useState("Payment due upon receipt unless otherwise agreed.");
  const [invoiceMessage, setInvoiceMessage] = useState("Thank you for your business.");
  const [resourceSeeds, setResourceSeeds] = useState<ResourceSeed[]>([
    { id: "setup-tds", title: "Product TDS", category: "TDS", type: "pdf", url: "", fileName: "Upload TDS PDFs later", tags: "tds, paint, product", notes: "Technical data sheets for products used in the shop." },
    { id: "setup-sds", title: "Product SDS", category: "SDS", type: "pdf", url: "", fileName: "Upload SDS PDFs later", tags: "sds, safety, chemical", notes: "Safety data sheets for paint, primers, clear, reducers, and cleaners." },
    { id: "setup-video", title: "Training Videos", category: "Workflow", type: "video", url: "", fileName: "", tags: "training, workflow", notes: "Video links for techniques, product guides, and process notes." },
  ]);

  const [serviceChoice, setServiceChoice] = useState<SetupChoice>("setup");
  const [inventoryChoice, setInventoryChoice] = useState<SetupChoice>("setup");
  const [jobChoice, setJobChoice] = useState<SetupChoice>("setup");
  const [invoiceChoice, setInvoiceChoice] = useState<SetupChoice>("setup");
  const [resourceChoice, setResourceChoice] = useState<SetupChoice>("setup");
  const [wallpaper, setWallpaper] = useState<WallpaperId>("w1");
  const [sound, setSound] = useState<SoundId>("s1");

  useEffect(() => {
    const match = WALLPAPERS.find((item) => item.id === wallpaper) ?? WALLPAPERS[0];
    document.documentElement.style.setProperty("--marshall-bg", `url('${match.url}')`);
    document.documentElement.style.setProperty("--marshall-bg-fallback", "#050607");
  }, [wallpaper]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const saved = loadSetupSettings();
      if (saved) {
        setUserName(saved.user.name === "User" ? "" : saved.user.name);
        setUserEmail(saved.user.email ?? "");
        setUserPhone(saved.user.phone ?? "");
        setShopName(saved.shop.name ?? "Miles Auto Refinishing");
        setShopLogo(saved.shop.logoDataUrl ?? "");
        setTimezone(saved.shop.timezone ?? tzDefault);
        setAlertEmailsRaw((saved.shop.alertEmails ?? []).join(", "));
        const labor = { ...DEFAULT_LABOR_BILLING, ...(saved.billing?.labor ?? {}) };
        setLaborEnabled(labor.enabled);
        setLaborRate(labor.hourlyRate);
        setMinimumHours(labor.minimumHours);
        setBillingIncrementMinutes(labor.billingIncrementMinutes);
        setMaterialBillingMode(labor.materialBillingMode);
        setMaterialBillingPercent(labor.materialBillingPercent);
        setMaterialMarkupPercent(labor.materialMarkupPercent);
        setCountMaterialsAsExpense(labor.countMaterialsAsExpense);
        setTaxPercent(labor.taxPercent);
        setInventoryChoice(saved.inventory.enabled ? "setup" : "skip");
        setJobChoice(saved.jobs.jobTypes.length || saved.jobs.stages.length ? "setup" : "skip");
        setReminders(saved.reminders.length ? saved.reminders : defaultReminders());
        setJobTypes(saved.jobs.jobTypes.length ? saved.jobs.jobTypes : DEFAULT_JOB_TYPES);
        setStages(saved.jobs.stages.length ? saved.jobs.stages : DEFAULT_STAGES);
        setWallpaper(saved.ui.wallpaper ?? "w1");
        setSound(saved.ui.sound ?? "s1");
      }
      try {
        const rawInventory = localStorage.getItem(INVENTORY_KEY);
        if (rawInventory) {
          const parsed = JSON.parse(rawInventory);
          if (Array.isArray(parsed?.items)) setInventoryItems(parsed.items);
        }
        const rawInvoice = localStorage.getItem(INVOICE_SETUP_KEY);
        if (rawInvoice) {
          const parsed = JSON.parse(rawInvoice);
          if (Number.isFinite(Number(parsed?.dueDays))) setInvoiceDueDays(Number(parsed.dueDays));
          if (typeof parsed?.terms === "string") setInvoiceTerms(parsed.terms);
          if (typeof parsed?.message === "string") setInvoiceMessage(parsed.message);
        }
      } catch {}

      const requestedStep = Number(new URLSearchParams(window.location.search).get("step"));
      if (Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < steps.length) {
        setStep(requestedStep);
        window.history.replaceState(null, "", "/setup");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [tzDefault]);

  const progress = step === 0 ? "Start" : `${steps[step]} ${step} / ${steps.length - 1}`;

  const buildSettings = (): Settings => ({
    user: {
      name: userName.trim() || "User",
      email: userEmail.trim() || undefined,
      phone: userPhone.trim() || undefined,
    },
    shop: {
      name: shopName.trim() || "MAR Shop",
      business: shopName.trim() || "MAR Shop",
      timezone: timezone.trim() || tzDefault,
      alertEmails: parseEmails(alertEmailsRaw),
      logoDataUrl: shopLogo,
    },
    customers: {
      enabled: true,
      allowJobCustomerLinking: true,
      requireCustomerOnJobs: false,
    },
    reminders: serviceChoice === "skip" ? [] : reminders,
    serviceCounters: [...COUNTERS],
    jobs: {
      jobTypes: jobTypes.length ? jobTypes : DEFAULT_JOB_TYPES,
      stages: stages.length ? stages : DEFAULT_STAGES,
      useChunks: true,
    },
    inventory: {
      enabled: inventoryChoice !== "skip",
      enableConsumables: inventoryChoice !== "skip",
      enableParts: inventoryChoice !== "skip",
      mode: inventoryChoice === "skip" ? "skip" : "now",
    },
    billing: {
      labor: {
        ...DEFAULT_LABOR_BILLING,
        enabled: laborEnabled,
        hourlyRate: laborRate,
        minimumHours,
        billingIncrementMinutes,
        includeMaterials: materialBillingMode !== "none",
        materialBillingMode,
        materialBillingPercent,
        countMaterialsAsExpense,
        materialMarkupPercent,
        taxPercent,
      },
    },
    ui: { wallpaper, sound, sassEnabled: true },
    meta: { createdAt: new Date().toISOString() },
  });

  const saveBaseline = () => {
    saveSetupSettings(buildSettings());
    if (inventoryChoice === "setup" && !localStorage.getItem(INVENTORY_KEY)) {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify({ items: inventoryItems, meta: { savedAt: new Date().toISOString() } }));
    }
    if (inventoryChoice === "setup" && localStorage.getItem(INVENTORY_KEY)) {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify({ items: inventoryItems, meta: { savedAt: new Date().toISOString() } }));
    }
    if (invoiceChoice === "setup") {
      localStorage.setItem(INVOICE_SETUP_KEY, JSON.stringify({ dueDays: invoiceDueDays, terms: invoiceTerms, message: invoiceMessage, savedAt: new Date().toISOString() }));
    }
    if (resourceChoice === "setup" && !localStorage.getItem(RESOURCES_KEY)) {
      localStorage.setItem(RESOURCES_KEY, JSON.stringify({
        resources: resourceSeeds.map((resource) => ({
          ...resource,
          url: resource.url.trim(),
          fileName: resource.fileName.trim(),
          fileType: resource.type === "pdf" && resource.fileName.trim() ? "application/pdf" : "",
          pinned: false,
          updatedAt: new Date().toISOString(),
        })),
        meta: { savedAt: new Date().toISOString() },
      }));
    }
    localStorage.setItem(COMPLETE_KEY, "true");
  };

  const finish = () => {
    saveBaseline();
    router.push("/dashboard");
  };

  const uploadLogo = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setShopLogo(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  };

  const playSound = () => {
    const chosen = SOUND_CHOICES.find((item) => item.id === sound);
    if (!chosen) return;
    const audio = new Audio(chosen.url);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  };

  const toggleReminder = (id: string) => {
    setReminders((list) => list.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };

  const updateReminder = (id: string, patch: Partial<Reminder>) => {
    setReminders((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeReminder = (id: string) => {
    setReminders((list) => list.filter((item) => item.id !== id));
  };

  const addCustomReminder = () => {
    setReminders((list) => [
      ...list,
      {
        id: uid(),
        name: "Custom Reminder",
        category: "Other",
        enabled: true,
        trigger: "months",
        limitValue: 6,
        warnValue: 1,
        lastServicedAtISO: new Date().toISOString().slice(0, 10),
      },
    ]);
    setServiceMode("custom");
  };

  const updateInventoryItem = (id: string, patch: Partial<InventoryItem>) => {
    setInventoryItems((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addInventoryItem = () => {
    setInventoryItems((list) => [...list, { ...defaultInventoryItems()[0], id: uid(), name: "", category: "consumable", unitPrice: 0, quantity: 0 }]);
  };

  const updateResourceSeed = (id: string, patch: Partial<ResourceSeed>) => {
    setResourceSeeds((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addResourceSeed = () => {
    setResourceSeeds((list) => [
      ...list,
      {
        id: uid(),
        title: "New Resource",
        category: "Other",
        type: "website",
        url: "",
        fileName: "",
        tags: "",
        notes: "",
      },
    ]);
  };

  const removeResourceSeed = (id: string) => {
    setResourceSeeds((list) => list.filter((item) => item.id !== id));
  };

  const addJobType = () => {
    const clean = jobTypeDraft.trim();
    if (!clean) return;
    setJobTypes((list) => list.includes(clean) ? list : [...list, clean]);
    setJobTypeDraft("");
  };

  const addStage = () => {
    const clean = stageDraft.trim();
    if (!clean) return;
    setStages((list) => list.includes(clean) ? list : [...list, clean]);
    setStageDraft("");
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="shell">
        <div className="brand">
          {shopLogo ? <img className="logoPreview" src={shopLogo} alt={shopName || "Shop logo"} /> : <img className="logo" src="/marshall-os.svg" alt="MARshall OS" />}
          <div>
            <div className="micro">FIRST-TIME SETUP</div>
            <h1>MARshall OS</h1>
          </div>
        </div>
        <div className="progress">{progress}</div>
      </header>

      {step === 0 && (
        <section className="hero">
          <div>
            <div className="eyebrow">Let&apos;s get started</div>
            <h2>Build the shop system before the work starts.</h2>
            <p>We will walk through account, service, inventory, jobs, invoices, resources, style, and then launch the dashboard.</p>
          </div>
          <div className="launchGrid">
            <Feature title="Money" text="Labor, material charging, tax, invoices, estimates, and paid totals." />
            <Feature title="Work" text="Service counters, inventory, job stages, sessions, and review flow." />
            <Feature title="Library" text="Resources, PDFs, SDS, TDS, links, tags, and shop notes." />
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => setStep(1)}>Let&apos;s Get Started</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="panel">
          <PanelTitle title="Account & Money" text="Set the shop identity, logo, labor, and how inventory is billed to customers." />
          <div className="formGrid">
            <label className="label">Name<input className="input" value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Andree" /></label>
            <label className="label">Email<input className="input" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="you@email.com" /></label>
            <label className="label">Number<input className="input" value={userPhone} onChange={(event) => setUserPhone(event.target.value)} placeholder="270-000-0000" /></label>
            <label className="label">Shop name<input className="input" value={shopName} onChange={(event) => setShopName(event.target.value)} /></label>
            <label className="label">Timezone<input className="input" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
            <label className="label">Alert emails<input className="input" value={alertEmailsRaw} onChange={(event) => setAlertEmailsRaw(event.target.value)} placeholder="you@email.com, shop@email.com" /></label>
            <label className="label full">Logo<input className="input" type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} /></label>
          </div>

          <div className="choiceSplit">
            <ChoiceCard title="Skip labor for later" text="Money made can stay N/A until settings are ready." active={!laborEnabled} onClick={() => setLaborEnabled(false)} />
            <ChoiceCard title="Set labor now" text="Use labor estimates in sessions, reviews, invoices, and billing." active={laborEnabled} onClick={() => setLaborEnabled(true)} />
          </div>

          {laborEnabled && (
            <>
              <div className="formGrid">
                <label className="label">Hourly rate<DecimalInput className="input" value={laborRate} onValueChange={setLaborRate} placeholder="85" /></label>
                <label className="label">Minimum hours<DecimalInput className="input" value={minimumHours} onValueChange={setMinimumHours} placeholder="0" /></label>
                <label className="label">Billing increment minutes<DecimalInput className="input" value={billingIncrementMinutes} onValueChange={setBillingIncrementMinutes} placeholder="15" /></label>
                <label className="label">Material markup percent<DecimalInput className="input" value={materialMarkupPercent} onValueChange={setMaterialMarkupPercent} placeholder="0" /></label>
                <label className="label">Default customer pay percent<DecimalInput className="input" value={materialBillingPercent} onValueChange={setMaterialBillingPercent} placeholder="100" /></label>
                <label className="label">Invoice tax percent<DecimalInput className="input" value={taxPercent} onValueChange={setTaxPercent} placeholder="0" /></label>
              </div>
              <div className="choiceSplit three">
                <ChoiceCard title="Pay none" text="Inventory is cost only by default." active={materialBillingMode === "none"} onClick={() => setMaterialBillingMode("none")} />
                <ChoiceCard title="Pay percent" text="Customer pays the percent set above." active={materialBillingMode === "percent"} onClick={() => setMaterialBillingMode("percent")} />
                <ChoiceCard title="Pay all" text="Customer pays all selected inventory by default." active={materialBillingMode === "all"} onClick={() => setMaterialBillingMode("all")} />
              </div>
              <div className="choiceSplit">
                <ChoiceCard title="Inventory counts as expense" text="Material cost subtracts from net pay." active={countMaterialsAsExpense} onClick={() => setCountMaterialsAsExpense(true)} />
                <ChoiceCard title="Do not expense inventory" text="Track it without subtracting from net pay." active={!countMaterialsAsExpense} onClick={() => setCountMaterialsAsExpense(false)} />
              </div>
            </>
          )}

          <Nav back={() => setStep(0)} next={() => setStep(2)} />
        </section>
      )}

      {step === 2 && (
        <SetupModule title="Service Setup" text="Set reminders, filters, booth inspections, compressor service, and runtime counters." choice={serviceChoice} onChange={setServiceChoice} back={() => setStep(1)} next={() => setStep(3)}>
          <div className="inlineSetup">
            <div className="choiceSplit">
              <ChoiceCard title="MARshall OS default" text="Use the built-in filter, booth, air system, and compressor reminders." active={serviceMode === "default"} onClick={() => setServiceMode("default")} />
              <ChoiceCard title="Custom setup" text="Start with the defaults, then add, edit, or remove reminder rules." active={serviceMode === "custom"} onClick={() => setServiceMode("custom")} />
            </div>
            <div className="setupTop">
              <strong>{reminders.filter((item) => item.enabled).length} active reminders</strong>
              {serviceMode === "custom" ? <button className="btn ghost" onClick={addCustomReminder}>Add Rule</button> : <span>Defaults can still be edited later from Service Settings.</span>}
            </div>
            {serviceMode === "default" ? (
              <div className="miniList">
                {reminders.map((reminder) => (
                  <button key={reminder.id} className={`miniRow ${reminder.enabled ? "on" : ""}`} onClick={() => toggleReminder(reminder.id)}>
                    <span>{reminder.category}</span>
                    <strong>{reminder.name}</strong>
                    <small>{reminder.trigger === "hours" ? `${reminder.limitValue} hr` : `${reminder.limitValue} ${reminder.trigger}`} / warn {reminder.warnValue}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="editList">
                {reminders.map((reminder) => (
                  <div className="editRow reminderEdit" key={reminder.id}>
                    <label className="miniLabel">Name<input className="input" value={reminder.name} onChange={(event) => updateReminder(reminder.id, { name: event.target.value })} /></label>
                    <label className="miniLabel">Category
                      <select className="input" value={reminder.category} onChange={(event) => updateReminder(reminder.id, { category: event.target.value as Reminder["category"] })}>
                        <option>Respirator</option><option>Booth</option><option>Air System</option><option>Compressor</option><option>Other</option>
                      </select>
                    </label>
                    <label className="miniLabel">Tracks
                      <select className="input" value={reminder.trigger} onChange={(event) => updateReminder(reminder.id, { trigger: event.target.value as Reminder["trigger"] })}>
                        <option value="hours">Hours</option><option value="days">Days</option><option value="months">Months</option><option value="manual_date">Manual date</option>
                      </select>
                    </label>
                    <label className="miniLabel">Limit<DecimalInput className="input" value={reminder.limitValue} onValueChange={(value) => updateReminder(reminder.id, { limitValue: value })} /></label>
                    <label className="miniLabel">Warn<DecimalInput className="input" value={reminder.warnValue} onValueChange={(value) => updateReminder(reminder.id, { warnValue: value })} /></label>
                    <div className="rowButtons">
                      <button className={`btn ghost ${reminder.enabled ? "activeTiny" : ""}`} onClick={() => toggleReminder(reminder.id)}>{reminder.enabled ? "On" : "Off"}</button>
                      <button className="btn danger" onClick={() => removeReminder(reminder.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SetupModule>
      )}
      {step === 3 && (
        <SetupModule title="Inventory Setup" text="Set consumables, parts, paint, thresholds, unit prices, and scale/manual counting." choice={inventoryChoice} onChange={setInventoryChoice} back={() => setStep(2)} next={() => setStep(4)}>
          <div className="inlineSetup">
            <div className="setupTop"><strong>Starter inventory</strong><button className="btn ghost" onClick={addInventoryItem}>Add Item</button></div>
            <div className="editList">
              {inventoryItems.map((item) => (
                <div className="editRow inventoryEdit" key={item.id}>
                  <label className="miniLabel">Item name<input className="input" value={item.name} onChange={(event) => updateInventoryItem(item.id, { name: event.target.value })} placeholder="3M 80 grit discs" /></label>
                  <label className="miniLabel">Type
                    <select className="input" value={item.category} onChange={(event) => updateInventoryItem(item.id, { category: event.target.value as InventoryItem["category"] })}>
                      <option value="consumable">Consumable</option>
                      <option value="part">Part</option>
                    </select>
                  </label>
                  <label className="miniLabel">Unit<input className="input" value={item.unit} onChange={(event) => updateInventoryItem(item.id, { unit: event.target.value })} placeholder="count" /></label>
                  <label className="miniLabel">Unit price<DecimalInput className="input" value={item.unitPrice} onValueChange={(value) => updateInventoryItem(item.id, { unitPrice: value })} placeholder="0.00" /></label>
                  <label className="miniLabel">Starting qty<DecimalInput className="input" value={item.quantity} onValueChange={(value) => updateInventoryItem(item.id, { quantity: value })} placeholder="0" /></label>
                </div>
              ))}
            </div>
          </div>
        </SetupModule>
      )}
      {step === 4 && (
        <SetupModule title="Job Setup" text="Set job types, stages, chunks, and the workflow that sessions use." choice={jobChoice} onChange={setJobChoice} back={() => setStep(3)} next={() => setStep(5)}>
          <div className="inlineSetup twoCol">
            <div>
              <div className="setupTop"><strong>Job types</strong></div>
              <div className="addLine"><input className="input" value={jobTypeDraft} onChange={(event) => setJobTypeDraft(event.target.value)} placeholder="Add job type" /><button className="btn ghost" onClick={addJobType}>Add</button></div>
              <div className="chipWrap">{jobTypes.map((item) => <button className="chip" key={item} onClick={() => setJobTypes((list) => list.filter((value) => value !== item))}>{item}</button>)}</div>
            </div>
            <div>
              <div className="setupTop"><strong>Stages</strong></div>
              <div className="addLine"><input className="input" value={stageDraft} onChange={(event) => setStageDraft(event.target.value)} placeholder="Add stage" /><button className="btn ghost" onClick={addStage}>Add</button></div>
              <div className="chipWrap">{stages.map((item) => <button className="chip" key={item} onClick={() => setStages((list) => list.filter((value) => value !== item))}>{item}</button>)}</div>
            </div>
          </div>
        </SetupModule>
      )}
      {step === 5 && (
        <SetupModule title="Invoice Setup" text="Review billing, draft/sent/paid flow, estimates, tax, invoice styling, and PDF output." choice={invoiceChoice} onChange={setInvoiceChoice} back={() => setStep(4)} next={() => setStep(6)}>
          <div className="inlineSetup">
            <div className="formGrid">
              <label className="label">Default due days<DecimalInput className="input" value={invoiceDueDays} onValueChange={setInvoiceDueDays} /></label>
              <label className="label">Tax percent<DecimalInput className="input" value={taxPercent} onValueChange={setTaxPercent} /></label>
              <label className="label full">Invoice terms<input className="input" value={invoiceTerms} onChange={(event) => setInvoiceTerms(event.target.value)} /></label>
              <label className="label full">Ending message<input className="input" value={invoiceMessage} onChange={(event) => setInvoiceMessage(event.target.value)} /></label>
            </div>
          </div>
        </SetupModule>
      )}
      {step === 6 && (
        <SetupModule title="Resource Setup" text="Add TDS, SDS, PDFs, websites, videos, sheets, tags, and shop notes." choice={resourceChoice} onChange={setResourceChoice} back={() => setStep(5)} next={() => setStep(7)}>
          <div className="inlineSetup">
            <div className="setupTop"><strong>Starter resources</strong><button className="btn ghost" onClick={addResourceSeed}>Add Resource</button></div>
            <div className="editList">
              {resourceSeeds.map((resource) => (
                <div className="editRow resourceEdit" key={resource.id}>
                  <label className="miniLabel">Title<input className="input" value={resource.title} onChange={(event) => updateResourceSeed(resource.id, { title: event.target.value })} /></label>
                  <label className="miniLabel">Category
                    <select className="input" value={resource.category} onChange={(event) => updateResourceSeed(resource.id, { category: event.target.value as ResourceSeed["category"] })}>
                      <option>TDS</option><option>SDS</option><option>Safety</option><option>Equipment</option><option>Paint</option><option>Workflow</option><option>Internal</option><option>Other</option>
                    </select>
                  </label>
                  <label className="miniLabel">Type
                    <select className="input" value={resource.type} onChange={(event) => updateResourceSeed(resource.id, { type: event.target.value as ResourceSeed["type"] })}>
                      <option value="pdf">PDF</option><option value="website">Website</option><option value="video">Video</option><option value="sheet">Sheet</option><option value="note">Note</option><option value="internal">Internal page</option>
                    </select>
                  </label>
                  <label className="miniLabel">{resource.type === "pdf" ? "PDF label" : "Link"}<input className="input" value={resource.type === "pdf" ? resource.fileName : resource.url} onChange={(event) => updateResourceSeed(resource.id, resource.type === "pdf" ? { fileName: event.target.value } : { url: event.target.value })} placeholder={resource.type === "pdf" ? "SDS - Clear Coat.pdf" : "https://..."} /></label>
                  <label className="miniLabel">Tags<input className="input" value={resource.tags} onChange={(event) => updateResourceSeed(resource.id, { tags: event.target.value })} placeholder="paint, safety" /></label>
                  <label className="miniLabel full">Notes<input className="input" value={resource.notes} onChange={(event) => updateResourceSeed(resource.id, { notes: event.target.value })} placeholder="Ratios, warnings, shelf location..." /></label>
                  <button className="btn danger rowRemove" onClick={() => removeResourceSeed(resource.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </SetupModule>
      )}

      {step === 7 && (
        <section className="panel">
          <PanelTitle title="Style Setup" text="Pick the wallpaper and notification ping that make MARshall feel like your shop." />
          <div className="twoCol">
            <div>
              <div className="subTitle">Wallpaper</div>
              <div className="pickGrid">
                {WALLPAPERS.map((item) => (
                  <button key={item.id} className={`pick ${wallpaper === item.id ? "on" : ""}`} onClick={() => setWallpaper(item.id)}>
                    <span className="thumb" style={{ backgroundImage: `url(${item.url})` }} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="subTitle">Notification ping</div>
              <div className="pickGrid">
                {SOUND_CHOICES.map((item) => (
                  <button key={item.id} className={`pick ${sound === item.id ? "on" : ""}`} onClick={() => setSound(item.id)}>{item.name}</button>
                ))}
              </div>
              <button className="btn ghost preview" onClick={playSound}>Preview Sound</button>
            </div>
          </div>
          <Nav back={() => setStep(6)} next={() => setStep(8)} nextLabel="Review" />
        </section>
      )}

      {step === 8 && (
        <section className="panel">
          <PanelTitle title="Welcome to MARshall OS" text="Your shop baseline is saved. One small warning before launch." />
          <div className="warning">
            <strong>During setup, use the buttons inside MARshall OS.</strong>
            <span>Please avoid the browser refresh button and the browser back/forward buttons while setup pages are open. They can interrupt local saves and return steps.</span>
          </div>
          <div className="summaryGrid">
            <Summary title="Service" value={choiceLabel(serviceChoice)} onClick={() => setStep(2)} />
            <Summary title="Inventory" value={choiceLabel(inventoryChoice)} onClick={() => setStep(3)} />
            <Summary title="Jobs" value={choiceLabel(jobChoice)} onClick={() => setStep(4)} />
            <Summary title="Invoices" value={choiceLabel(invoiceChoice)} onClick={() => setStep(5)} />
            <Summary title="Resources" value={choiceLabel(resourceChoice)} onClick={() => setStep(6)} />
            <Summary title="Labor" value={laborEnabled ? `$${laborRate || 0}/hr` : "Skip for later"} onClick={() => setStep(1)} />
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setStep(7)}>Back</button>
            <button className="btn primary" onClick={finish}>Go to Dashboard</button>
          </div>
        </section>
      )}

      <footer className="foot">
        <Link href="/" className="quiet">Back to boot</Link>
        <span>Settings save when you finish or open a focused setup page.</span>
      </footer>

      <style jsx global>{styles}</style>
    </main>
  );
}

function choiceLabel(choice: SetupChoice) {
  return choice === "setup" ? "Set up" : "Skip for later";
}

function PanelTitle({ title, text }: { title: string; text: string }) {
  return <div className="panelHead"><div className="panelTitle">{title}</div><div className="panelText">{text}</div></div>;
}

function Feature({ title, text }: { title: string; text: string }) {
  return <div className="feature"><strong>{title}</strong><span>{text}</span></div>;
}

function ChoiceCard({ title, text, active, onClick }: { title: string; text: string; active: boolean; onClick: () => void }) {
  return <button className={`choice ${active ? "on" : ""}`} onClick={onClick}><strong>{title}</strong><span>{text}</span></button>;
}

function Nav({ back, next, nextLabel = "Next" }: { back: () => void; next: () => void; nextLabel?: string }) {
  return <div className="actions"><button className="btn" onClick={back}>Back</button><button className="btn primary" onClick={next}>{nextLabel}</button></div>;
}

function SetupModule({
  title,
  text,
  choice,
  onChange,
  back,
  next,
  children,
}: {
  title: string;
  text: string;
  choice: SetupChoice;
  onChange: (value: SetupChoice) => void;
  back: () => void;
  next: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="panel">
      <PanelTitle title={title} text={text} />
      <div className="choiceSplit">
        <ChoiceCard title="Skip for later" text="Leave this for the main app or Settings." active={choice === "skip"} onClick={() => onChange("skip")} />
        <ChoiceCard title="Set up now" text="Show the setup section here." active={choice === "setup"} onClick={() => onChange("setup")} />
      </div>
      {choice === "setup" && children}
      <div className="actions">
        <button className="btn" onClick={back}>Back</button>
        <button className="btn primary" onClick={next}>Next</button>
      </div>
    </section>
  );
}

function Summary({ title, value, onClick }: { title: string; value: string; onClick: () => void }) {
  return <div className="summary"><div className="micro">{title}</div><strong>{value}</strong><button className="btn ghost" onClick={onClick}>Open</button></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 24px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.38)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; align-content: start; gap: 16px; }
  .shell, .hero, .panel, .foot { width: min(1080px, 100%); margin: 0 auto; }
  .shell { display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.34); border-radius: 16px; padding: 12px 14px; backdrop-filter: blur(8px); }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .logo, .logoPreview { height: 48px; width: 48px; object-fit: contain; border-radius: 10px; filter: drop-shadow(0 10px 20px rgba(0,0,0,.5)); }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  h1 { margin: 2px 0 0; font-size: 30px; line-height: 1; }
  h2 { margin: 0; font-size: clamp(40px, 6vw, 72px); line-height: .92; max-width: 780px; }
  p { margin: 12px 0 0; max-width: 720px; color: rgba(238,241,243,.78); line-height: 1.45; }
  .progress { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 900; white-space: nowrap; }
  .hero, .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 18px; padding: 22px; display: grid; gap: 18px; backdrop-filter: blur(8px); box-shadow: 0 20px 70px rgba(0,0,0,.25); }
  .eyebrow, .subTitle { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 1000; opacity: .72; }
  .launchGrid, .summaryGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .choiceSplit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .choiceSplit.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .feature, .summary, .choice { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; min-height: 96px; display: grid; gap: 6px; align-content: start; color: #eef1f3; text-align: left; }
  .feature strong, .summary strong, .choice strong { font-size: 16px; }
  .feature span, .summary span, .choice span { opacity: .72; font-size: 13px; line-height: 1.35; }
  .choice { cursor: pointer; }
  .choice.on { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.3); }
  .panelHead { display: grid; gap: 5px; }
  .panelTitle { font-size: 20px; font-weight: 1000; }
  .panelText { opacity: .72; font-size: 14px; }
  .formGrid, .twoCol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 800; }
  .full { grid-column: 1 / -1; }
  .input { width: 100%; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 12px; outline: none; }
  .inlineSetup { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 12px; padding: 14px; display: grid; gap: 12px; }
  .setupTop { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
  .setupTop span { color: rgba(238,241,243,.72); font-size: 13px; }
  .miniList, .editList { display: grid; gap: 8px; max-height: 420px; overflow: auto; padding-right: 4px; }
  .miniRow { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); color: #eef1f3; border-radius: 10px; padding: 11px; text-align: left; cursor: pointer; display: grid; gap: 4px; }
  .miniRow.on { border-color: rgba(150,220,255,.32); background: rgba(120,200,255,.11); }
  .miniRow span, .miniRow small { color: rgba(238,241,243,.68); font-size: 12px; }
  .editRow { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(80px,.5fr) minmax(100px,.55fr) minmax(80px,.45fr); gap: 8px; align-items: end; }
  .inventoryEdit { grid-template-columns: minmax(0,1.25fr) 140px 110px 130px 130px; }
  .reminderEdit { grid-template-columns: minmax(0,1.5fr) 145px 130px 105px 105px 180px; }
  .resourceEdit { grid-template-columns: minmax(0,1.2fr) 120px 120px minmax(0,1fr) minmax(0,1fr) 110px; }
  .resourceEdit .full { grid-column: 1 / -2; }
  .miniLabel { display: grid; gap: 6px; color: rgba(238,241,243,.68); font-size: 11px; font-weight: 1000; letter-spacing: 1px; text-transform: uppercase; }
  .rowButtons { display: flex; gap: 8px; align-items: end; }
  .rowRemove { align-self: end; }
  .activeTiny { border-color: rgba(150,220,255,.35); background: rgba(120,200,255,.13); }
  .danger { border-color: rgba(255,120,120,.28); background: rgba(120,20,35,.25); }
  .addLine { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; }
  .chipWrap { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.22); color: #eef1f3; border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; cursor: pointer; }
  .pickGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
  .pick { min-height: 48px; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 10px; cursor: pointer; font-weight: 900; text-align: left; }
  .pick.on { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.28); }
  .thumb { width: 44px; height: 30px; border-radius: 6px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.16); flex: 0 0 auto; }
  .warning { border: 1px solid rgba(255,200,100,.28); background: rgba(255,180,70,.1); border-radius: 12px; padding: 14px; display: grid; gap: 6px; }
  .warning span { color: rgba(238,241,243,.78); line-height: 1.4; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 11px 13px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .ghost, .preview { background: rgba(255,255,255,.055); }
  .foot { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; opacity: .62; font-size: 12px; }
  .quiet { color: #eef1f3; text-decoration: none; }
  @media (max-width: 820px) { .wrap { padding: 14px; } .shell { align-items: flex-start; } .launchGrid, .summaryGrid, .choiceSplit, .choiceSplit.three, .formGrid, .twoCol, .pickGrid, .editRow, .inventoryEdit, .reminderEdit, .resourceEdit, .addLine { grid-template-columns: 1fr; } .resourceEdit .full { grid-column: auto; } h2 { font-size: 42px; } .actions { justify-content: stretch; } .btn { flex: 1 1 auto; } }
`;
