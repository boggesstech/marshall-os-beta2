export const KEYS = {
  jobs: "marshall_jobs_v1",
  sessions: "marshall_sessions_v1",
  runtime: "marshall_runtime_v1",
  notifications: "marshall_notifications_v1",
  inventory: "marshall_inventory_v1",
  settings: "marshall_settings_v1",
  setupComplete: "marshall_setupComplete",
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);