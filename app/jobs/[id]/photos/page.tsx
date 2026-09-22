"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import { photoFileToStorageDataUrl, stripOversizedPhotoDataUrl } from "@/lib/imageStorage";
import { KEYS, loadJSON, saveJSON, uid } from "@/lib/marStorage";

type Job = {
  id: string;
  title?: string;
  name?: string;
  customer?: string;
  customerName?: string;
  vehicle?: string | { year?: string; make?: string; model?: string };
};

type SessionPhoto = {
  id: string;
  sessionId: string;
  name: string;
  dataUrl: string;
  caption?: string;
  createdAt: string;
};

type PhotoSheetItem = {
  id: string;
  sourceId?: string;
  name: string;
  dataUrl: string;
  caption: string;
  createdAt: string;
};

type PhotoSheet = {
  jobId: string;
  title: string;
  notes: string;
  photos: PhotoSheetItem[];
  updatedAt: string;
};

type Session = {
  id?: string;
  jobId?: string;
  photos?: { id?: string; name?: string; dataUrl?: string; caption?: string; createdAt?: string }[];
  images?: { id?: string; name?: string; dataUrl?: string; createdISO?: string }[];
  photoSheet?: { photos?: { id?: string; sourceId?: string; name?: string; dataUrl?: string; caption?: string; createdAt?: string }[] };
};

const PHOTO_SHEETS_KEY = "marshall_job_photo_sheets_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function asList<T>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw) && key && Array.isArray(raw[key])) return raw[key] as T[];
  if (isRecord(raw) && Array.isArray(raw.jobs)) return raw.jobs as T[];
  if (isRecord(raw) && Array.isArray(raw.sessions)) return raw.sessions as T[];
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
  })).filter((job) => job.id);
}

function titleFor(job?: Job) {
  return job?.title || job?.name || "Untitled job";
}

function vehicleFor(job?: Job) {
  if (!job?.vehicle) return "No vehicle";
  if (typeof job.vehicle === "string") return job.vehicle;
  return [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ") || "No vehicle";
}

function sessionPhotoId(sessionId: string, id: unknown, fallback: string) {
  const raw = String(id ?? fallback);
  return raw.startsWith(`${sessionId}:`) ? raw : `${sessionId}:${raw}`;
}

function dedupeSessionPhotos(photos: SessionPhoto[]) {
  const seenIds = new Set<string>();
  const seenDataUrls = new Set<string>();
  return photos.filter((photo) => {
    if (!photo.dataUrl) return false;
    if (seenIds.has(photo.id) || seenDataUrls.has(photo.dataUrl)) return false;
    seenIds.add(photo.id);
    seenDataUrls.add(photo.dataUrl);
    return true;
  });
}

function normalizeSessionPhotos(raw: unknown, jobId: string): SessionPhoto[] {
  const sessions = asList<Session>(raw, "sessions").filter((session) => String(session.jobId ?? "") === jobId);
  return dedupeSessionPhotos(sessions.flatMap((session) => {
    const sessionId = String(session.id ?? uid());
    const legacy = Array.isArray(session.photos)
      ? session.photos.map((photo, index) => ({
        id: sessionPhotoId(sessionId, photo.id, `photo-${index}`),
        sessionId,
        name: String(photo.name ?? `Photo ${index + 1}`),
        dataUrl: String(photo.dataUrl ?? ""),
        caption: typeof photo.caption === "string" ? photo.caption : "",
        createdAt: String(photo.createdAt ?? ""),
      }))
      : [];
    const images = Array.isArray(session.images)
      ? session.images.map((image, index) => ({
        id: sessionPhotoId(sessionId, image.id, `image-${index}`),
        sessionId,
        name: String(image.name ?? `Image ${index + 1}`),
        dataUrl: String(image.dataUrl ?? ""),
        caption: "",
        createdAt: String(image.createdISO ?? ""),
      }))
      : [];
    const sheetPhotos = Array.isArray(session.photoSheet?.photos)
      ? session.photoSheet.photos.map((photo, index) => ({
        id: sessionPhotoId(sessionId, photo.sourceId ?? photo.id, `sheet-${index}`),
        sessionId,
        name: String(photo.name ?? `Photo ${index + 1}`),
        dataUrl: String(photo.dataUrl ?? ""),
        caption: String(photo.caption ?? ""),
        createdAt: String(photo.createdAt ?? ""),
      }))
      : [];
    return [...legacy, ...images, ...sheetPhotos];
  }));
}

function loadSheet(jobId: string, job?: Job): PhotoSheet {
  const fallback: PhotoSheet = {
    jobId,
    title: `${titleFor(job)} Photo Sheet`,
    notes: "",
    photos: [],
    updatedAt: new Date().toISOString(),
  };
  const raw = loadJSON<unknown>(PHOTO_SHEETS_KEY, {});
  if (!isRecord(raw) || !isRecord(raw[jobId])) return fallback;
  const sheet = raw[jobId];
  return {
    ...fallback,
    title: String(sheet.title ?? fallback.title),
    notes: String(sheet.notes ?? ""),
    photos: Array.isArray(sheet.photos)
      ? sheet.photos.filter(isRecord).map((photo) => ({
        id: String(photo.id ?? uid()),
        sourceId: typeof photo.sourceId === "string" ? photo.sourceId : undefined,
        name: String(photo.name ?? "Photo"),
        dataUrl: String(photo.dataUrl ?? ""),
        caption: String(photo.caption ?? ""),
        createdAt: String(photo.createdAt ?? ""),
      })).filter((photo) => photo.dataUrl || photo.sourceId)
      : [],
    updatedAt: String(sheet.updatedAt ?? fallback.updatedAt),
  };
}

function saveSheet(sheet: PhotoSheet) {
  const allSheets = loadJSON<Record<string, PhotoSheet>>(PHOTO_SHEETS_KEY, {});
  saveJSON(PHOTO_SHEETS_KEY, {
    ...allSheets,
    [sheet.jobId]: {
      ...sheet,
      photos: sheet.photos.map((photo) => ({ ...photo, dataUrl: stripOversizedPhotoDataUrl(photo.dataUrl) })).filter((photo) => photo.dataUrl || photo.sourceId),
      updatedAt: new Date().toISOString(),
    },
  });
}

function mergeSourcePhotosIntoSheet(sheet: PhotoSheet, sourcePhotos: SessionPhoto[]): PhotoSheet {
  const sourceById = new Map(sourcePhotos.map((photo) => [photo.id, photo]));
  const hydratedPhotos = sheet.photos.map((photo) => {
    const source = photo.sourceId ? sourceById.get(photo.sourceId) : undefined;
    return {
      ...photo,
      dataUrl: photo.dataUrl || source?.dataUrl || "",
      caption: photo.caption || source?.caption || "",
      createdAt: photo.createdAt || source?.createdAt || "",
    };
  });
  const usedSourceIds = new Set(hydratedPhotos.map((photo) => photo.sourceId).filter(Boolean));
  const usedDataUrls = new Set(hydratedPhotos.map((photo) => photo.dataUrl).filter(Boolean));
  const additions = sourcePhotos
    .filter((photo) => !usedSourceIds.has(photo.id) && !usedDataUrls.has(photo.dataUrl))
    .map((photo) => ({
      id: uid(),
      sourceId: photo.id,
      name: photo.name,
      dataUrl: photo.dataUrl,
      caption: photo.caption ?? "",
      createdAt: photo.createdAt,
    }));

  return additions.length
    ? { ...sheet, photos: [...hydratedPhotos, ...additions], updatedAt: new Date().toISOString() }
    : { ...sheet, photos: hydratedPhotos };
}

export default function JobPhotosPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<Job | undefined>();
  const [sourcePhotos, setSourcePhotos] = useState<SessionPhoto[]>([]);
  const [sheet, setSheet] = useState<PhotoSheet>(() => ({ jobId, title: "Photo Sheet", notes: "", photos: [], updatedAt: "" }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Record<string, true>>({});
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const jobs = normalizeJobs(loadJSON<unknown>(KEYS.jobs, []));
      const foundJob = jobs.find((item) => item.id === jobId);
      const photos = normalizeSessionPhotos(loadJSON<unknown>(KEYS.sessions, []), jobId);
      const loadedSheet = mergeSourcePhotosIntoSheet(loadSheet(jobId, foundJob), photos);
      setJob(foundJob);
      setSourcePhotos(photos);
      setSheet(loadedSheet);
      setPickerOpen(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [jobId]);

  const unusedSourcePhotos = useMemo(() => {
    const used = new Set(sheet.photos.map((photo) => photo.sourceId).filter(Boolean));
    return sourcePhotos.filter((photo) => !used.has(photo.id));
  }, [sheet.photos, sourcePhotos]);

  const selectedCount = Object.keys(selectedSourceIds).length;

  const persist = (next: PhotoSheet) => {
    setSheet(next);
    saveSheet(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const patchSheet = (patch: Partial<PhotoSheet>) => {
    setSheet((current) => ({ ...current, ...patch }));
    setSavedAt("");
  };

  const addSelectedPhotos = () => {
    const selected = unusedSourcePhotos.filter((photo) => selectedSourceIds[photo.id]);
    const nextPhotos = [
      ...sheet.photos,
      ...selected.map((photo) => ({
        id: uid(),
        sourceId: photo.id,
        name: photo.name,
        dataUrl: photo.dataUrl,
        caption: photo.caption ?? "",
        createdAt: photo.createdAt,
      })),
    ];
    patchSheet({ photos: nextPhotos });
    setSelectedSourceIds({});
    setPickerOpen(false);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const photos = await Promise.all(Array.from(files).filter((file) => file.type.startsWith("image/")).map(async (file) => ({
      id: uid(),
      name: file.name,
      dataUrl: await photoFileToStorageDataUrl(file),
      caption: "",
      createdAt: new Date().toISOString(),
    }))).then((items) => items.filter((photo) => photo.dataUrl));
    patchSheet({ photos: [...sheet.photos, ...photos] });
  };

  const updatePhoto = (id: string, patch: Partial<PhotoSheetItem>) => {
    patchSheet({ photos: sheet.photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)) });
  };

  const removePhoto = (id: string) => {
    patchSheet({ photos: sheet.photos.filter((photo) => photo.id !== id) });
  };

  const movePhoto = (id: string, direction: -1 | 1) => {
    const index = sheet.photos.findIndex((photo) => photo.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sheet.photos.length) return;
    const next = [...sheet.photos];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    patchSheet({ photos: next });
  };

  const save = () => {
    persist(sheet);
  };

  if (!job) {
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

  return (
    <main className="wrap">
      <ApplyWallpaper />

      <header className="topbar">
        <div>
          <div className="micro">JOB PHOTOS</div>
          <h1>{sheet.title}</h1>
          <p>{titleFor(job)} · {job.customerName || job.customer || "No customer"} · {vehicleFor(job)}</p>
        </div>
        <div className="topActions">
          {savedAt && <span className="saved">Saved at {savedAt}</span>}
          <button className="btn primary" onClick={save}>Save Sheet</button>
          <button className="btn ghost" onClick={() => setPickerOpen(true)}>Add Photos From Job</button>
          <label className="btn ghost">Upload Photos<input type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} hidden /></label>
          <Link className="btn ghost" href={`/jobs/${job.id}`}>Job Detail</Link>
        </div>
      </header>

      <section className="workspace">
        <section className="panel editor">
          <div className="formGrid">
            <label className="label">Sheet title
              <input className="input" value={sheet.title} onChange={(event) => patchSheet({ title: event.target.value })} />
            </label>
            <label className="label">Sheet notes
              <input className="input" value={sheet.notes} onChange={(event) => patchSheet({ notes: event.target.value })} placeholder="Before/after set, teardown notes, delivery photos..." />
            </label>
          </div>

          <div className="photoList">
            {sheet.photos.map((photo, index) => (
              <article className="photoRow" key={photo.id}>
                <img src={photo.dataUrl} alt={photo.caption || photo.name} />
                <div className="photoEdit">
                  <div className="rowTop">
                    <strong>Photo {index + 1}</strong>
                    <span>{photo.name}</span>
                  </div>
                  <label className="label">Caption
                    <textarea className="input caption" value={photo.caption} onChange={(event) => updatePhoto(photo.id, { caption: event.target.value })} placeholder="Add caption..." />
                  </label>
                  <div className="rowActions">
                    <button className="btn ghost" disabled={index === 0} onClick={() => movePhoto(photo.id, -1)}>Move Up</button>
                    <button className="btn ghost" disabled={index === sheet.photos.length - 1} onClick={() => movePhoto(photo.id, 1)}>Move Down</button>
                    <button className="btn danger" onClick={() => removePhoto(photo.id)}>Remove</button>
                  </div>
                </div>
              </article>
            ))}
            {sheet.photos.length === 0 && (
              <div className="empty">
                No photos on this sheet yet.
                <span>Add photos from the job or upload more from your computer.</span>
              </div>
            )}
          </div>
        </section>

        <aside className="panel preview">
          <div>
            <div className="panelTitle">Preview</div>
            <div className="hint">{sheet.photos.length} photo(s) arranged for this job.</div>
          </div>
          <div className="sheetPreview">
            {sheet.photos.map((photo, index) => (
              <figure key={photo.id}>
                <img src={photo.dataUrl} alt={photo.caption || photo.name} />
                <figcaption>{photo.caption || `Photo ${index + 1}`}</figcaption>
              </figure>
            ))}
          </div>
        </aside>
      </section>

      {pickerOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Add photos from job">
          <section className="modal">
            <div className="modalTop">
              <div>
                <div className="panelTitle">Photos On This Job</div>
                <div className="hint">Select photos from previous sessions, then arrange and caption them on the sheet.</div>
              </div>
              <button className="x" onClick={() => setPickerOpen(false)}>Close</button>
            </div>

            <div className="sourceGrid">
              {unusedSourcePhotos.map((photo) => (
                <button
                  className={`sourcePhoto ${selectedSourceIds[photo.id] ? "on" : ""}`}
                  key={photo.id}
                  onClick={() => setSelectedSourceIds((current) => {
                    const next = { ...current };
                    if (next[photo.id]) delete next[photo.id];
                    else next[photo.id] = true;
                    return next;
                  })}
                >
                  <img src={photo.dataUrl} alt={photo.name} />
                  <span>{photo.name}</span>
                </button>
              ))}
              {unusedSourcePhotos.length === 0 && <div className="empty">No unused job photos found. Upload new photos instead.</div>}
            </div>

            <div className="modalActions">
              <button className="btn ghost" onClick={() => setPickerOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={selectedCount === 0} onClick={addSelectedPhotos}>Add {selectedCount || ""} Photo{selectedCount === 1 ? "" : "s"}</button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 18px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.42)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .topbar, .workspace { width: min(1240px, 100%); margin: 0 auto; }
  .topbar, .panel, .modal { border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; backdrop-filter: blur(10px); }
  .topbar { padding: 18px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; box-shadow: 0 18px 54px rgba(0,0,0,.22); }
  .micro { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .95; }
  p, .hint { margin: 8px 0 0; color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; }
  .topActions, .rowActions, .modalActions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .btn, .x { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.32); }
  .ghost { background: rgba(255,255,255,.05); }
  .danger { background: rgba(140,35,35,.2); border-color: rgba(255,120,120,.26); }
  .saved { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 9px 11px; font-size: 12px; font-weight: 900; }
  .workspace { display: grid; grid-template-columns: minmax(0,1fr) minmax(330px,.38fr); gap: 14px; align-items: start; }
  .panel { padding: 16px; display: grid; gap: 14px; }
  .preview { position: sticky; top: 14px; }
  .panelTitle { font-size: 18px; font-weight: 1000; }
  .formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .label { display: grid; gap: 7px; font-size: 13px; font-weight: 850; }
  .input { width: 100%; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .caption { min-height: 92px; resize: vertical; }
  .photoList { display: grid; gap: 12px; }
  .photoRow { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 12px; align-items: start; }
  .photoRow img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); }
  .photoEdit { display: grid; gap: 10px; }
  .rowTop { display: flex; justify-content: space-between; gap: 10px; color: rgba(238,241,243,.7); font-size: 12px; }
  .rowTop strong { color: #eef1f3; }
  .sheetPreview { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  figure { margin: 0; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 10px; padding: 8px; display: grid; gap: 7px; }
  figure img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }
  figcaption { color: rgba(238,241,243,.78); font-size: 12px; line-height: 1.3; }
  .empty { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); border-radius: 10px; padding: 14px; color: rgba(238,241,243,.72); display: grid; gap: 4px; }
  .modalBackdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.58); display: grid; place-items: center; padding: 18px; }
  .modal { width: min(980px, 100%); max-height: min(760px, 92vh); overflow: auto; padding: 16px; display: grid; gap: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.38); }
  .modalTop { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .sourceGrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
  .sourcePhoto { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 10px; padding: 8px; display: grid; gap: 7px; text-align: left; cursor: pointer; }
  .sourcePhoto.on { border-color: rgba(160,220,255,.48); background: rgba(120,190,255,.16); }
  .sourcePhoto img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }
  .sourcePhoto span { font-size: 12px; opacity: .78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 980px) { .topbar, .workspace, .photoRow, .formGrid { display: grid; grid-template-columns: 1fr; } .preview { position: static; } .sourceGrid, .sheetPreview { grid-template-columns: 1fr 1fr; } .topActions, .rowActions, .modalActions { justify-content: stretch; } .btn { flex: 1 1 auto; } }
  @media (max-width: 560px) { .sourceGrid, .sheetPreview { grid-template-columns: 1fr; } }
`;
