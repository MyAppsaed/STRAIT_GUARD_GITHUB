// Simple per-level high score store (localStorage).
const KEY = "straitguard.highscores.v1";

type Store = Record<string, number>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function getHighScore(level: number): number {
  return read()[`L${level}`] ?? 0;
}

export function submitScore(level: number, score: number): { best: number; isNew: boolean } {
  const s = read();
  const key = `L${level}`;
  const prev = s[key] ?? 0;
  if (score > prev) {
    s[key] = score;
    write(s);
    return { best: score, isNew: true };
  }
  return { best: prev, isNew: false };
}
