"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApplyWallpaper from "@/components/ApplyWallpaper";
import {
  DEFAULT_JOB_TYPES,
  DEFAULT_STAGES,
  defaultSetupSettings,
  loadSetupSettings,
  saveSetupSettings,
} from "@/lib/setupData";

export default function JobSetupPage() {
  const router = useRouter();
  const [jobTypes, setJobTypes] = useState<string[]>(DEFAULT_JOB_TYPES);
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [useChunks, setUseChunks] = useState(true);
  const [jobTypeDraft, setJobTypeDraft] = useState("");
  const [stageDraft, setStageDraft] = useState("");
  const [returnStep, setReturnStep] = useState(5);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      const requestedStep = Number(new URLSearchParams(window.location.search).get("returnStep"));
      if (Number.isInteger(requestedStep)) setReturnStep(requestedStep);
      const settings = loadSetupSettings();
      setJobTypes(settings?.jobs?.jobTypes?.length ? settings.jobs.jobTypes : DEFAULT_JOB_TYPES);
      setStages(settings?.jobs?.stages?.length ? settings.jobs.stages : DEFAULT_STAGES);
      setUseChunks(settings?.jobs?.useChunks ?? true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const addJobType = () => {
    const v = jobTypeDraft.trim();
    if (!v) return;
    setJobTypes((types) => (types.includes(v) ? types : [...types, v]));
    setJobTypeDraft("");
  };

  const addStage = () => {
    const v = stageDraft.trim();
    if (!v) return;
    setStages((items) => (items.includes(v) ? items : [...items, v]));
    setStageDraft("");
  };

  const save = () => {
    const settings = loadSetupSettings() ?? defaultSetupSettings(Intl.DateTimeFormat().resolvedOptions().timeZone);
    saveSetupSettings({
      ...settings,
      jobs: {
        jobTypes: jobTypes.length ? jobTypes : ["General Job"],
        stages: stages.length ? stages : ["Work"],
        useChunks,
      },
    });
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  };

  const continueSetup = () => {
    save();
    router.push(`/setup?step=${returnStep}`);
  };

  return (
    <main className="wrap">
      <ApplyWallpaper />
      <header className="top">
        <div>
          <div className="micro">JOB SETUP</div>
          <h1>Jobs</h1>
          <p>Build the job language once so every job folder starts with familiar choices.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => router.push(`/setup?step=${returnStep}`)}>Return to Setup</button>
          <Link className="btn ghost" href="/dashboard" onClick={save}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <div className="twoCol">
          <Editor
            title="Job Types"
            placeholder="Add a job type"
            draft={jobTypeDraft}
            setDraft={setJobTypeDraft}
            add={addJobType}
            items={jobTypes}
            remove={(v) => setJobTypes((types) => types.filter((x) => x !== v))}
          />
          <Editor
            title="Default Stages"
            placeholder="Add a stage"
            draft={stageDraft}
            setDraft={setStageDraft}
            add={addStage}
            items={stages}
            remove={(v) => setStages((items) => items.filter((x) => x !== v))}
          />
        </div>

        <button className={`chunk ${useChunks ? "on" : ""}`} onClick={() => setUseChunks((v) => !v)}>
          <span className="dot" />
          <span>
            <strong>Use chunks</strong>
            <small>Track cab, doors, fenders, and other sections inside a job.</small>
          </span>
        </button>

        <div className="actions">
          <button className="btn primary" onClick={save}>Save Job Setup</button>
          <button className="btn primary" onClick={continueSetup}>Save & Continue Setup</button>
        </div>
        {savedAt && <div className="saved">Saved at {savedAt}</div>}
      </section>

      <style jsx global>{styles}</style>
    </main>
  );
}

function Editor({
  title,
  placeholder,
  draft,
  setDraft,
  add,
  items,
  remove,
}: {
  title: string;
  placeholder: string;
  draft: string;
  setDraft: (v: string) => void;
  add: () => void;
  items: string[];
  remove: (v: string) => void;
}) {
  return (
    <div className="editor">
      <div className="title">{title}</div>
      <div className="addRow">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}>Add</button>
      </div>
      <div className="chips">
        {items.map((item) => (
          <button className="chip" key={item} onClick={() => remove(item)}>
            {item}<span>Remove</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = `
  .wrap { min-height: 100vh; padding: 24px; color: #eef1f3; font-family: system-ui, -apple-system, Segoe UI, Roboto; background-color: var(--marshall-bg-fallback, #050607); background-image: linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.4)), var(--marshall-bg); background-size: cover; background-position: center; background-attachment: fixed; display: grid; gap: 14px; align-content: start; }
  .top, .panel { width: min(1040px, 100%); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.42); border-radius: 16px; padding: 18px; backdrop-filter: blur(8px); }
  .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .micro { font-size: 11px; letter-spacing: 2px; opacity: .68; }
  h1 { margin: 4px 0 0; font-size: 38px; line-height: 1; }
  p { color: rgba(238,241,243,.72); font-size: 13px; line-height: 1.4; margin: 8px 0 0; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .saved { justify-self: end; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; }
  .btn { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #eef1f3; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 950; text-decoration: none; }
  .primary { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); }
  .ghost { background: rgba(255,255,255,.05); }
  .twoCol { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .editor { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); border-radius: 8px; padding: 14px; display: grid; gap: 12px; align-content: start; }
  .title { font-size: 18px; font-weight: 1000; }
  .addRow { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .input { width: 100%; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.14); color: #eef1f3; border-radius: 10px; padding: 11px 12px; outline: none; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.22); color: #eef1f3; border-radius: 999px; padding: 8px 10px; cursor: pointer; font-weight: 900; }
  .chip span { opacity: .55; font-size: 10px; margin-left: 7px; text-transform: uppercase; letter-spacing: .8px; }
  .chunk { margin-top: 12px; width: 100%; text-align: left; display: flex; gap: 12px; align-items: center; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); color: #eef1f3; border-radius: 8px; padding: 14px; cursor: pointer; }
  .chunk small { display: block; margin-top: 3px; opacity: .7; font-size: 12px; }
  .dot { width: 10px; height: 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); flex: 0 0 auto; }
  .chunk.on .dot { background: rgba(255,255,255,.8); }
  @media (max-width: 820px) { .wrap { padding: 14px; } .top, .twoCol, .addRow { display: grid; grid-template-columns: 1fr; } .actions .btn { flex: 1 1 auto; } }
`;
