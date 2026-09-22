"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import type { Settings } from "@/lib/setupData";

const SETTINGS_KEY = "marshall_settings_v1";
const INVENTORY_KEY = "marshall_inventory_v1";
const CUSTOMERS_KEY = "marshall_customers_v1";
const JOBS_KEY = "marshall_jobs_v1";

type Notice = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warn" | "urgent";
};

type InventoryItem = {
  quantity?: number;
  minThreshold?: number;
};

type DashboardData = {
  settings: Settings | null;
  inventoryItems: InventoryItem[];
  customers: unknown[];
  jobs: Array<{ status?: string }>;
};

const emptyData: DashboardData = {
  settings: null,
  inventoryItems: [],
  customers: [],
  jobs: [],
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadDashboardData(): DashboardData {
  const settings = readJSON<Settings | null>(SETTINGS_KEY, null);
  const inventory = readJSON<{ items?: InventoryItem[] }>(INVENTORY_KEY, {});
  const customerData = readJSON<{ customers?: unknown[] }>(CUSTOMERS_KEY, {});
  const jobsRaw = readJSON<unknown>(JOBS_KEY, []);
  const jobs = Array.isArray(jobsRaw)
    ? (jobsRaw as Array<{ status?: string }>)
    : Array.isArray((jobsRaw as { items?: unknown[] })?.items)
      ? ((jobsRaw as { items?: Array<{ status?: string }> }).items ?? [])
      : [];

  return {
    settings,
    inventoryItems: Array.isArray(inventory.items) ? inventory.items : [],
    customers: Array.isArray(customerData.customers) ? customerData.customers : [],
    jobs,
  };
}

function buildNotices(data: DashboardData): Notice[] {
  const notices: Notice[] = [];
  const settings = data.settings;
  const user = settings?.user?.name || "User";
  const shop = settings?.shop?.name || "Shop";

  notices.push({
    id: "welcome",
    title: `Welcome, ${user}`,
    body: `${shop} is online and ready for clock-in.`,
    severity: "info",
  });

  const reminders = settings?.reminders ?? [];
  const missingDates = reminders.filter(
    (reminder) =>
      (reminder.trigger === "days" || reminder.trigger === "months" || reminder.trigger === "manual_date") &&
      !reminder.lastServicedAtISO
  );

  if (missingDates.length > 0) {
    notices.push({
      id: "missing-service-dates",
      title: "Service dates needed",
      body: `${missingDates.length} calendar reminder(s) need a last-serviced date.`,
      severity: "warn",
    });
  }

  const lowStock = data.inventoryItems.filter((item) => Number(item.quantity ?? 0) <= Number(item.minThreshold ?? -1));
  if (lowStock.length > 0 && settings?.inventory?.enabled) {
    notices.push({
      id: "low-stock",
      title: "Inventory needs attention",
      body: `${lowStock.length} item(s) are at or below threshold.`,
      severity: "warn",
    });
  }

  return notices;
}

function formatNow(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function LiveClock() {
  const [text, setText] = useState("");

  useEffect(() => {
    const tick = () => setText(formatNow(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return <span suppressHydrationWarning>{text || " "}</span>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [hiddenIds, setHiddenIds] = useState<Record<string, true>>({});

  useEffect(() => {
    const id = window.setTimeout(() => setData(loadDashboardData()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const shopName = data.settings?.shop?.name ?? "Miles Auto Refinishing";
  const userName = data.settings?.user?.name ?? "";
  const activeJobs = data.jobs.filter((job) => job.status !== "done").length;
  const lowStock = data.inventoryItems.filter((item) => Number(item.quantity ?? 0) <= Number(item.minThreshold ?? -1)).length;
  const reminderCount = data.settings?.reminders?.filter((reminder) => reminder.enabled).length ?? 0;

  const allNotices = useMemo(() => buildNotices(data), [data]);
  const visibleNotices = useMemo(() => allNotices.filter((notice) => !hiddenIds[notice.id]), [allNotices, hiddenIds]);

  const clearNotices = () => {
    const next: Record<string, true> = {};
    for (const notice of allNotices) next[notice.id] = true;
    setHiddenIds(next);
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/marshall-os.svg" alt="MARshall OS" />
          <div className="brandText">
            <div className="micro">DASHBOARD</div>
            <div className="brandTitle">{shopName}</div>
            {userName && <div className="brandSub">{userName}</div>}
          </div>
        </div>

        <div className="clock"><LiveClock /></div>

        <div className="topActions">
          <Link className="topBtn" href="/settings">Settings</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <div className="micro">SHOP STATUS</div>
          <h1>Ready for the next move.</h1>
          <p>Clock in, open a job, check alerts, or jump straight into inventory without hunting around.</p>
        </div>
        <div className="heroActions">
          <Link className="heroBtn primary" href="/clock-in">Clock In</Link>
          <Link className="heroBtn" href="/jobs">Open Jobs</Link>
        </div>
      </section>

      <section className="metrics">
        <Metric label="Active jobs" value={String(activeJobs)} />
        <Metric label="Customers" value={String(data.customers.length)} />
        <Metric label="Inventory items" value={String(data.inventoryItems.length)} />
        <Metric label="Low stock" value={String(lowStock)} tone={lowStock > 0 ? "warn" : "normal"} />
        <Metric label="Reminders" value={String(reminderCount)} />
      </section>

      <section className="mainGrid">
        <div className="panel launchPanel">
          <PanelHeader title="Launch" text="Core tools for the day." />
          <div className="tiles">
            <Tile href="/clock-in" icon="/icons/clock.png" title="Clock In" desc="Start a session and drive counters." />
            <Tile href="/jobs" icon="/icons/folder.png" title="Jobs" desc="Create and manage job folders." />
            <Tile href="/inventory" icon="/icons/box.png" title="Inventory" desc="Parts, paint, consumables, thresholds." />
            <Tile href="/customers" icon="/icons/customer.png" title="Customers" desc="Contacts, vehicles, notes, tags." />
            <Tile href="/service" icon="/icons/wrench.png" title="Service" desc="Reset filters and service reminders." />
            <Tile href="/billing" icon="/icons/invoice.png" title="Billing" desc="Invoices from time and materials." />
            <Tile href="/resources" icon="/icons/book.png" title="Resources" desc="TDS sheets, diagrams, shop links." />
            <Tile href="/settings" icon="/gear-icon.svg" title="Settings" desc="Setup, appearance, reset, preferences." />
          </div>
        </div>

        <aside className="sideStack">
          <div className="panel">
            <div className="panelTop">
              <PanelHeader title="Notification Center" text="Alerts generated from setup, rules, and inventory." />
              <button className="clearBtn" onClick={clearNotices}>Clear</button>
            </div>

            {visibleNotices.length === 0 ? (
              <div className="empty">No alerts right now.</div>
            ) : (
              <div className="noticeList">
                {visibleNotices.map((notice) => (
                  <div key={notice.id} className={`notice ${notice.severity}`}>
                    <div className="noticeTop">
                      <strong>{notice.title}</strong>
                      <button className="hideBtn" onClick={() => setHiddenIds((hidden) => ({ ...hidden, [notice.id]: true }))}>Hide</button>
                    </div>
                    <p>{notice.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function PanelHeader({ title, text }: { title: string; text: string }) {
  return (
    <div className="panelHeader">
      <div className="panelTitle">{title}</div>
      <div className="panelHint">{text}</div>
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Tile({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link className="tile" href={href}>
      <img src={icon} alt="" />
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
    </Link>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .heroPanel, .metrics, .mainGrid { width: min(1240px, 100%); margin: 0 auto; }
  .topbar { min-height: 78px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.38); border-radius: 16px; padding: 10px 14px; backdrop-filter: blur(8px); }
  .brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
  .logo { height: 50px; width: auto; filter: drop-shadow(0 10px 22px rgba(0,0,0,.5)); }
  .brandText { display: grid; gap: 2px; min-width: 0; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; text-transform: uppercase; }
  .brandTitle { font-size: 17px; font-weight: 1000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brandSub { opacity: .72; font-size: 12px; }
  .clock { justify-self: center; min-width: 224px; text-align: center; font-size: 13px; font-weight: 950; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 12px; }
  .topActions { justify-self: end; display: flex; gap: 10px; }
  .topBtn, .heroBtn, .clearBtn, .hideBtn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; text-decoration: none; cursor: pointer; font-weight: 950; display: inline-flex; justify-content: center; align-items: center; }
  .heroPanel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 18px; padding: 24px; display: flex; justify-content: space-between; gap: 18px; align-items: end; backdrop-filter: blur(8px); box-shadow: 0 20px 70px rgba(0,0,0,.22); }
  h1 { margin: 6px 0 0; font-size: clamp(34px, 5vw, 62px); line-height: .94; max-width: 720px; }
  p { margin: 10px 0 0; color: rgba(238,241,243,.75); font-size: 14px; line-height: 1.4; max-width: 680px; }
  .heroActions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .heroBtn { min-height: 48px; min-width: 132px; }
  .primary { background: rgba(255,255,255,.2); border-color: rgba(255,255,255,.34); }
  .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  .metric { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.38); border-radius: 10px; padding: 14px; display: grid; gap: 4px; backdrop-filter: blur(8px); }
  .metric span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .68; }
  .metric strong { font-size: 28px; line-height: 1; }
  .metric.warn { border-color: rgba(255,190,80,.34); background: rgba(120,70,0,.22); }
  .mainGrid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, .65fr); gap: 12px; align-items: start; }
  .sideStack { display: grid; gap: 12px; }
  .panel { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; display: grid; gap: 14px; backdrop-filter: blur(8px); }
  .panelTop { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .panelHint { opacity: .7; font-size: 12px; line-height: 1.35; margin-top: 4px; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .tile { min-height: 96px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #eef1f3; border-radius: 10px; padding: 13px; text-decoration: none; display: flex; gap: 12px; align-items: flex-start; transition: transform 120ms ease, background 120ms ease, border-color 120ms ease; }
  .tile:hover { transform: translateY(-1px); background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.26); }
  .tile img { width: 30px; height: 30px; object-fit: contain; opacity: .95; flex: 0 0 auto; }
  .tile span { display: grid; gap: 4px; }
  .tile strong { font-size: 15px; }
  .tile small { opacity: .72; font-size: 12px; line-height: 1.3; }
  .noticeList { display: grid; gap: 10px; }
  .notice { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 10px; padding: 12px; display: grid; gap: 5px; }
  .notice.warn { border-color: rgba(255,190,80,.34); }
  .notice.urgent { border-color: rgba(255,90,90,.42); }
  .noticeTop { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .notice p { font-size: 12.5px; margin: 0; }
  .clearBtn, .hideBtn { padding: 8px 10px; font-size: 12px; }
  .empty { opacity: .75; font-size: 13px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 12px; }
  @media (max-width: 980px) { .wrap { padding: 12px; } .topbar, .heroPanel, .mainGrid { grid-template-columns: 1fr; display: grid; } .clock, .topActions { justify-self: start; } .heroActions { justify-content: stretch; } .heroBtn, .topBtn { flex: 1 1 auto; } .metrics, .tiles { grid-template-columns: 1fr; } h1 { font-size: 40px; } }
`;
