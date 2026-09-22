"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { uid } from "@/lib/marStorage";

type ResourceCategory = "TDS" | "SDS" | "Safety" | "Equipment" | "Paint" | "Workflow" | "Internal" | "Other";
type ResourceType = "pdf" | "video" | "website" | "sheet" | "note" | "internal";

type Resource = {
  id: string;
  title: string;
  category: ResourceCategory;
  type: ResourceType;
  url: string;
  fileName: string;
  fileType: string;
  notes: string;
  tags: string;
  pinned: boolean;
  updatedAt: string;
};

const RESOURCES_KEY = "marshall_resources_v2";
const LEGACY_RESOURCES_KEY = "marshall_resources_v1";
const DB_NAME = "marshall_resources_files";
const DB_STORE = "files";

const categories: Array<"All" | ResourceCategory> = ["All", "TDS", "SDS", "Safety", "Equipment", "Paint", "Workflow", "Internal", "Other"];
const resourceCategories: ResourceCategory[] = ["TDS", "SDS", "Safety", "Equipment", "Paint", "Workflow", "Internal", "Other"];
const resourceTypes: ResourceType[] = ["pdf", "video", "website", "sheet", "note", "internal"];

const blankResource = (): Resource => ({
  id: uid(),
  title: "",
  category: "Other",
  type: "website",
  url: "",
  fileName: "",
  fileType: "",
  notes: "",
  tags: "",
  pinned: false,
  updatedAt: new Date().toISOString(),
});

const starterResources: Resource[] = [
  {
    id: "internal-service",
    title: "Service Rules",
    category: "Internal",
    type: "internal",
    url: "/service/manage",
    fileName: "",
    fileType: "",
    notes: "Edit filters, counters, service limits, and warning windows.",
    tags: "service, filters, reminders",
    pinned: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "internal-inventory",
    title: "Inventory",
    category: "Internal",
    type: "internal",
    url: "/inventory",
    fileName: "",
    fileType: "",
    notes: "Parts, consumables, paint materials, thresholds, and unit prices.",
    tags: "inventory, materials, paint",
    pinned: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "paint-mix",
    title: "Paint Mix Notes",
    category: "Paint",
    type: "note",
    url: "",
    fileName: "",
    fileType: "",
    notes: "Store reducer ratios, flash times, booth temperature notes, and product-specific reminders here.",
    tags: "paint, mix, clear, base",
    pinned: false,
    updatedAt: new Date().toISOString(),
  },
];

function normalizeCategory(value: unknown): ResourceCategory {
  if (value === "TDS / SDS") return "TDS";
  return resourceCategories.includes(value as ResourceCategory) ? value as ResourceCategory : "Other";
}

function normalizeType(value: unknown): ResourceType {
  if (value === "link") return "website";
  return resourceTypes.includes(value as ResourceType) ? value as ResourceType : "website";
}

function loadResources(): Resource[] {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY) ?? localStorage.getItem(LEGACY_RESOURCES_KEY);
    if (!raw) return starterResources;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.resources) ? parsed.resources : [];
    return list.map((resource: Partial<Resource>) => ({
      ...blankResource(),
      ...resource,
      id: String(resource.id ?? uid()),
      title: String(resource.title ?? ""),
      category: normalizeCategory(resource.category),
      type: normalizeType(resource.type),
      url: String(resource.url ?? ""),
      fileName: String(resource.fileName ?? ""),
      fileType: String(resource.fileType ?? ""),
      notes: String(resource.notes ?? ""),
      tags: String(resource.tags ?? ""),
      pinned: Boolean(resource.pinned),
      updatedAt: String(resource.updatedAt ?? new Date().toISOString()),
    }));
  } catch {
    return starterResources;
  }
}

function saveResources(resources: Resource[]) {
  localStorage.setItem(RESOURCES_KEY, JSON.stringify({ resources, meta: { savedAt: new Date().toISOString() } }));
}

function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveResourceFile(resourceId: string, file: File) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(file, resourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteResourceFile(resourceId: string) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(resourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function clearResourceFiles() {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadResourceFile(resourceId: string): Promise<Blob | null> {
  const db = await openFileDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(resourceId);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function typeLabel(type: ResourceType) {
  if (type === "pdf") return "PDF";
  if (type === "website") return "Website";
  if (type === "video") return "Video";
  if (type === "sheet") return "Sheet";
  if (type === "internal") return "Internal";
  return "Note";
}

function resourceHref(resource: Resource) {
  if (resource.type === "note" || resource.type === "pdf") return "";
  return resource.url.trim();
}

function tagList(tags: string) {
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | ResourceCategory>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Resource>(() => blankResource());
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loaded = loadResources();
      setResources(loaded);
      setSelectedId(loaded[0]?.id ?? null);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0];

  useEffect(() => {
    let revoke = "";
    const clearId = window.setTimeout(() => setPdfUrl(""), 0);
    if (!selected || selected.type !== "pdf" || !selected.fileName) return;
    loadResourceFile(selected.id).then((blob) => {
      if (!blob) return;
      revoke = URL.createObjectURL(blob);
      setPdfUrl(revoke);
    }).catch(() => {});
    return () => {
      window.clearTimeout(clearId);
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources
      .filter((resource) => category === "All" || resource.category === category)
      .filter((resource) => !q || `${resource.title} ${resource.category} ${resource.type} ${resource.notes} ${resource.tags} ${resource.fileName}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [category, query, resources]);

  const counts = useMemo(() => ({
    total: resources.length,
    tds: resources.filter((resource) => resource.category === "TDS").length,
    sds: resources.filter((resource) => resource.category === "SDS").length,
    pdfs: resources.filter((resource) => resource.type === "pdf").length,
  }), [resources]);

  const persist = (next: Resource[]) => {
    setResources(next);
    saveResources(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const startNew = () => {
    setEditingId(null);
    setDraft(blankResource());
    setDraftFile(null);
    setEditorOpen(true);
  };

  const startEdit = (resource: Resource) => {
    setEditingId(resource.id);
    setDraft(resource);
    setDraftFile(null);
    setEditorOpen(true);
  };

  const patchDraft = (patch: Partial<Resource>) => setDraft((current) => ({ ...current, ...patch }));

  const saveDraft = async () => {
    const clean: Resource = {
      ...draft,
      title: draft.title.trim() || "Untitled resource",
      url: draft.url.trim(),
      notes: draft.notes.trim(),
      tags: draft.tags.trim(),
      fileName: draftFile?.name ?? draft.fileName,
      fileType: draftFile?.type ?? draft.fileType,
      updatedAt: new Date().toISOString(),
    };
    if (draftFile) await saveResourceFile(clean.id, draftFile);
    const next = editingId
      ? resources.map((resource) => (resource.id === editingId ? clean : resource))
      : [clean, ...resources];
    persist(next);
    setEditingId(clean.id);
    setSelectedId(clean.id);
    setDraft(clean);
    setDraftFile(null);
    setEditorOpen(false);
  };

  const updateSelectedNotes = (notes: string) => {
    if (!selected) return;
    const next = resources.map((resource) =>
      resource.id === selected.id ? { ...resource, notes, updatedAt: new Date().toISOString() } : resource
    );
    persist(next);
  };

  const removeResource = async (id: string) => {
    await deleteResourceFile(id).catch(() => {});
    const next = resources.filter((resource) => resource.id !== id);
    persist(next);
    if (editingId === id) startNew();
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const togglePinned = (id: string) => {
    persist(resources.map((resource) => resource.id === id ? { ...resource, pinned: !resource.pinned, updatedAt: new Date().toISOString() } : resource));
  };

  const resetStarterResources = async () => {
    await clearResourceFiles().catch(() => {});
    persist(starterResources);
    setSelectedId(starterResources[0]?.id ?? null);
    startNew();
  };

  const deleteAllResources = async () => {
    await clearResourceFiles().catch(() => {});
    persist([]);
    setSelectedId(null);
    setDeleteAllOpen(false);
    startNew();
    setEditorOpen(false);
  };

  const openPdf = () => {
    if (pdfUrl) setPdfOpen(true);
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/marshall-os.svg" alt="MARshall OS" />
          <div>
            <div className="micro">RESOURCES</div>
            <h1>Shop Resources</h1>
            <p>TDS, SDS, PDFs, videos, websites, sheets, tags, and shop notes in one place.</p>
          </div>
        </div>
        <div className="topActions">
          <button className="btn primary" onClick={startNew}>Add Resource</button>
          <Link className="btn ghost" href="/dashboard">Dashboard</Link>
          <Link className="btn ghost" href="/settings">Settings</Link>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Resources" value={String(counts.total)} />
        <Metric label="TDS" value={String(counts.tds)} />
        <Metric label="SDS" value={String(counts.sds)} />
        <Metric label="PDFs" value={String(counts.pdfs)} />
      </section>

      <section className="workspace">
        <section className="panel listPanel">
          <div className="tools">
            <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources, tags, files..." />
            <button className="btn primary addResource" onClick={startNew}>Add Resource</button>
            <div className="chips">
              {categories.map((item) => (
                <button key={item} className={`chip ${category === item ? "on" : ""}`} onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="resourceList">
            {filtered.map((resource) => (
              <article className={`resourceCard ${selected?.id === resource.id ? "selected" : ""}`} key={resource.id}>
                <button className="cardMain" onClick={() => setSelectedId(resource.id)}>
                  <div className="cardTop">
                    <span className="tag">{resource.category}</span>
                    <span className="tag subtle">{typeLabel(resource.type)}</span>
                    {resource.pinned && <span className="tag pin">Pinned</span>}
                  </div>
                  <h2>{resource.title}</h2>
                  {resource.notes && <p>{resource.notes}</p>}
                  <div className="tagRow">
                    {tagList(resource.tags).slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
                    {tagList(resource.tags).length === 0 && <span>No tags</span>}
                  </div>
                  <div className="meta">
                    <span>{resource.fileName || resource.url || "Note resource"}</span>
                    <span>Updated {shortDate(resource.updatedAt)}</span>
                  </div>
                </button>
                <div className="cardActions">
                  <button className="btn ghost" onClick={() => startEdit(resource)}>Edit</button>
                  <button className="btn ghost" onClick={() => togglePinned(resource.id)}>{resource.pinned ? "Unpin" : "Pin"}</button>
                  <button className="btn danger" onClick={() => removeResource(resource.id)}>Remove</button>
                </div>
              </article>
            ))}
            {filtered.length === 0 && <div className="empty">No resources match that search.</div>}
          </div>
        </section>

        <section className="panel detailPanel">
          {selected ? (
            <>
              <div className="detailHead">
                <div>
                  <div className="micro">{selected.category} · {typeLabel(selected.type)}</div>
                  <div className="panelTitle">{selected.title}</div>
                  <div className="hint">{selected.fileName || selected.url || "No file or link attached"}</div>
                </div>
                <div className="detailActions">
                  {selected.type === "pdf" && <button className="btn primary" disabled={!pdfUrl} onClick={openPdf}>Open PDF</button>}
                  {resourceHref(selected) && (resourceHref(selected).startsWith("/") ? (
                    <Link className="btn primary" href={resourceHref(selected)}>Open</Link>
                  ) : (
                    <a className="btn primary" href={resourceHref(selected)} target="_blank" rel="noreferrer">Open</a>
                  ))}
                  <button className="btn ghost" onClick={() => startEdit(selected)}>Edit</button>
                </div>
              </div>

              <div className="resourceStats">
                <InfoBox label="Type" value={typeLabel(selected.type)} />
                <InfoBox label="Files" value={selected.fileName ? "1" : "0"} />
                <InfoBox label="Links" value={selected.url ? "1" : "0"} />
                <InfoBox label="Tags" value={String(tagList(selected.tags).length)} />
              </div>

              <div className="summaryBox">
                <div>
                  <div className="summaryLabel">File</div>
                  <strong>{selected.fileName || "No stored file"}</strong>
                </div>
                <div>
                  <div className="summaryLabel">Link</div>
                  <strong>{selected.url || "No link"}</strong>
                </div>
              </div>

              <label className="label">Notes
                <textarea className="input notes detailNotes" value={selected.notes} onChange={(event) => updateSelectedNotes(event.target.value)} placeholder="Resource notes, mix ratios, warnings, booth conditions..." />
              </label>

              <div className="tagRow">
                {tagList(selected.tags).map((tag) => <span key={tag}>#{tag}</span>)}
                {tagList(selected.tags).length === 0 && <span>No tags yet</span>}
              </div>
            </>
          ) : (
            <div className="empty">Select a resource to preview it.</div>
          )}
        </section>
      </section>

      {editorOpen && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Resource editor">
          <aside className="modal editorModal">
          <div>
            <div className="panelTitle">{editingId ? "Edit Resource" : "Add Resource"}</div>
            <div className="hint">Upload PDFs for TDS/SDS, or save videos, websites, sheets, internal pages, and note-only resources.</div>
          </div>

          <label className="label">Title
            <input className="input" value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} placeholder="Example: Clear coat TDS" />
          </label>

          <div className="grid2">
            <label className="label">Category
              <select className="input" value={draft.category} onChange={(event) => patchDraft({ category: event.target.value as ResourceCategory })}>
                {resourceCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="label">Type
              <select className="input" value={draft.type} onChange={(event) => patchDraft({ type: event.target.value as ResourceType })}>
                <option value="pdf">PDF</option>
                <option value="video">Video link</option>
                <option value="website">Website</option>
                <option value="sheet">Sheet</option>
                <option value="internal">Internal page</option>
                <option value="note">Note only</option>
              </select>
            </label>
          </div>

          {draft.type === "pdf" ? (
            <label className="label">PDF file
              <input className="input" type="file" accept="application/pdf" onChange={(event) => setDraftFile(event.target.files?.[0] ?? null)} />
              <span className="hint">{draftFile?.name || draft.fileName || "No PDF selected"}</span>
            </label>
          ) : draft.type !== "note" ? (
            <label className="label">URL or app path
              <input className="input" value={draft.url} onChange={(event) => patchDraft({ url: event.target.value })} placeholder="https://..., Google Sheet, video, or /inventory" />
            </label>
          ) : null}

          <label className="label">Notes
            <textarea className="input notes" value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} placeholder="Ratios, warnings, tool setup, product notes..." />
          </label>

          <label className="label">Tags
            <input className="input" value={draft.tags} onChange={(event) => patchDraft({ tags: event.target.value })} placeholder="paint, clear, tds" />
          </label>

          <button className={`pinToggle ${draft.pinned ? "on" : ""}`} onClick={() => patchDraft({ pinned: !draft.pinned })}>
            {draft.pinned ? "Pinned to top" : "Pin to top"}
          </button>

          <div className="editorActions">
            <button className="btn primary" onClick={saveDraft}>{editingId ? "Save Changes" : "Add Resource"}</button>
            <button className="btn ghost" onClick={() => {
              setEditorOpen(false);
              startNew();
              setEditorOpen(false);
            }}>Cancel</button>
            <button className="btn ghost" onClick={() => setDraft(blankResource())}>Clear</button>
            <button className="btn ghost" onClick={resetStarterResources}>Reset Starters</button>
            <button className="btn danger" onClick={() => setDeleteAllOpen(true)}>Delete All</button>
          </div>
          {savedAt && <div className="saved">Saved at {savedAt}</div>}
          </aside>
        </div>
      )}

      {pdfOpen && selected?.type === "pdf" && (
        <div className="modalShade pdfShade" role="dialog" aria-modal="true" aria-label="PDF viewer">
          <section className="pdfModal">
            <div className="pdfModalHead">
              <div>
                <div className="micro">{selected.category} · PDF</div>
                <div className="panelTitle">{selected.title}</div>
              </div>
              <button className="btn ghost" onClick={() => setPdfOpen(false)}>Close</button>
            </div>
            <div className="pdfModalBody">
              <div className="pdfFrame">
                {pdfUrl ? <iframe title={selected.title} src={pdfUrl} /> : <div className="empty">PDF file not found. Re-upload the PDF from the editor.</div>}
              </div>
              <aside className="inlineNotes">
                <div>
                  <div className="panelTitle">Notes</div>
                  <div className="hint">These save with this resource.</div>
                </div>
                <textarea className="input notes inlineNoteArea" value={selected.notes} onChange={(event) => updateSelectedNotes(event.target.value)} placeholder="Mix ratios, safety notes, flash times, product warnings..." />
                <div className="tagRow">{tagList(selected.tags).map((tag) => <span key={tag}>#{tag}</span>)}</div>
              </aside>
            </div>
          </section>
        </div>
      )}

      {deleteAllOpen && (
        <div className="modalShade" role="dialog" aria-modal="true" aria-label="Delete all resources">
          <div className="modal">
            <div className="panelTitle">Delete all resources?</div>
            <p>This removes every saved resource and clears stored PDF files from this browser.</p>
            <div className="modalActions">
              <button className="btn ghost" onClick={() => setDeleteAllOpen(false)}>Cancel</button>
              <button className="btn danger" onClick={deleteAllResources}>Delete Everything</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="infoBox"><span>{label}</span><strong>{value}</strong></div>;
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .metrics, .workspace { width: min(1440px, 100%); margin: 0 auto; }
  .topbar, .panel, .metric { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; backdrop-filter: blur(10px); }
  .topbar { padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .brand { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .logo { width: 50px; height: auto; filter: drop-shadow(0 10px 20px rgba(0,0,0,.45)); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  h2 { margin: 8px 0 0; font-size: 22px; line-height: 1.1; }
  p, .hint { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .cardActions, .editorActions, .chips, .detailActions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn, .chip, .pinToggle { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .primary, .chip.on, .pinToggle.on { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { background: rgba(140,35,35,.2); border-color: rgba(255,120,120,.26); }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
  .metric { padding: 14px; display: grid; gap: 4px; }
  .metric span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .metric strong { font-size: 28px; line-height: 1; }
  .workspace { display: grid; grid-template-columns: minmax(360px,.78fr) minmax(420px,1fr); gap: 14px; align-items: start; }
  .panel { padding: 16px; display: grid; gap: 14px; min-width: 0; }
  .detailPanel { position: sticky; top: 14px; }
  .tools { display: grid; gap: 10px; }
  .search, .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .resourceList { display: grid; gap: 12px; max-height: 72vh; overflow: auto; padding-right: 4px; }
  .resourceCard { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 12px; padding: 12px; display: grid; gap: 10px; }
  .resourceCard.selected { border-color: rgba(180,220,255,.34); background: rgba(120,190,255,.1); }
  .cardMain { appearance: none; border: 0; background: transparent; color: inherit; padding: 0; text-align: left; cursor: pointer; display: grid; gap: 2px; }
  .cardTop, .meta, .tagRow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tag { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 6px 8px; font-size: 11px; font-weight: 950; text-transform: uppercase; }
  .tag.subtle { opacity: .72; }
  .tag.pin { border-color: rgba(180,220,255,.34); background: rgba(120,190,255,.12); }
  .tagRow { margin-top: 8px; color: rgba(190,220,255,.82); font-size: 12px; }
  .meta { margin-top: 8px; color: rgba(238,241,243,.62); font-size: 12px; }
  .detailHead { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .resourceStats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
  .infoBox { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 10px; padding: 12px; display: grid; gap: 5px; min-width: 0; }
  .infoBox span, .summaryLabel { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; opacity: .66; font-weight: 900; }
  .infoBox strong, .summaryBox strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .summaryBox { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); border-radius: 12px; padding: 12px; display: grid; gap: 12px; }
  .inlineNotes { border-left: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); padding: 14px; display: grid; gap: 12px; align-content: start; }
  .inlineNoteArea { min-height: 360px; }
  .previewLink, .notePreview { margin: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 12px; padding: 18px; color: #eef1f3; text-decoration: none; font-weight: 950; display: grid; place-items: center; text-align: center; white-space: pre-wrap; }
  .notesPane { display: grid; gap: 10px; }
  .detailNotes { min-height: 420px; resize: vertical; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .notes { min-height: 120px; resize: vertical; font-family: inherit; }
  .saved, .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 12px; color: rgba(238,241,243,.72); }
  .modalShade { position: fixed; inset: 0; background: rgba(0,0,0,.64); display: grid; place-items: center; padding: 18px; z-index: 20; }
  .modal { width: min(480px, 100%); border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 18px; display: grid; gap: 12px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .editorModal { width: min(720px, 100%); max-height: 92vh; overflow: auto; }
  .pdfShade { place-items: stretch; }
  .pdfModal { width: min(1360px, 100%); height: min(900px, 94vh); margin: auto; border: 1px solid rgba(255,255,255,.16); background: rgba(8,10,14,.96); border-radius: 16px; padding: 14px; display: grid; grid-template-rows: auto minmax(0,1fr); gap: 12px; box-shadow: 0 24px 90px rgba(0,0,0,.5); }
  .pdfModalHead { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .pdfModalBody { display: grid; grid-template-columns: minmax(0,1fr) minmax(280px,.32fr); gap: 12px; min-height: 0; }
  .pdfFrame { min-height: 0; border: 1px solid rgba(255,255,255,.1); background: #fff; border-radius: 12px; overflow: hidden; }
  .pdfFrame iframe { width: 100%; height: 100%; min-height: 520px; border: 0; background: #fff; }
  .modalActions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  @media (max-width: 1180px) { .workspace { grid-template-columns: minmax(0,1fr); } .detailPanel { position: static; } .resourceList { max-height: none; } }
  @media (max-width: 760px) { .topbar { display: grid; } .topActions, .cardActions, .editorActions, .detailActions, .modalActions, .pdfModalHead { justify-content: stretch; } .btn { flex: 1 1 auto; } .metrics, .grid2, .detailHead, .resourceStats, .pdfModalBody { grid-template-columns: 1fr; display: grid; } .inlineNotes { border-left: 0; border-top: 1px solid rgba(255,255,255,.1); } }
`;
