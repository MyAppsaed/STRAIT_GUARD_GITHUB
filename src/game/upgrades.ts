// Persistent progression: currency (points) + purchased upgrade tiers.
// Points are earned per run = round(score / 10). Stored in localStorage.
const KEY = "straitguard.upgrades.v1";

export type UpgradeKey = "frigateSpeed" | "cargoArmor" | "bombCapacity";

export interface UpgradeState {
  points: number;
  tiers: Record<UpgradeKey, number>; // 0..maxTier
}

export interface UpgradeDef {
  key: UpgradeKey;
  maxTier: number;
  cost: (tier: number) => number; // cost to go from `tier` -> `tier+1`
  // Applied game values per tier index (tier 0 = base):
  values: number[];
}

// Definitions
export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  frigateSpeed: {
    key: "frigateSpeed",
    maxTier: 4,
    cost: (t) => 150 + t * 200,
    // base 380 → +8% per tier
    values: [380, 410, 445, 480, 520],
  },
  cargoArmor: {
    key: "cargoArmor",
    maxTier: 4,
    cost: (t) => 200 + t * 250,
    // base 300 HP → +75/tier
    values: [300, 375, 450, 525, 600],
  },
  bombCapacity: {
    key: "bombCapacity",
    maxTier: 2,
    cost: (t) => 300 + t * 350,
    // 3 → 4 → 5
    values: [3, 4, 5],
  },
};

const DEFAULT: UpgradeState = {
  points: 0,
  tiers: { frigateSpeed: 0, cargoArmor: 0, bombCapacity: 0 },
};

export function loadUpgrades(): UpgradeState {
  if (typeof window === "undefined") return { ...DEFAULT, tiers: { ...DEFAULT.tiers } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, tiers: { ...DEFAULT.tiers } };
    const parsed = JSON.parse(raw) as Partial<UpgradeState>;
    return {
      points: Math.max(0, Math.floor(parsed.points ?? 0)),
      tiers: {
        frigateSpeed: clampTier("frigateSpeed", parsed.tiers?.frigateSpeed ?? 0),
        cargoArmor: clampTier("cargoArmor", parsed.tiers?.cargoArmor ?? 0),
        bombCapacity: clampTier("bombCapacity", parsed.tiers?.bombCapacity ?? 0),
      },
    };
  } catch {
    return { ...DEFAULT, tiers: { ...DEFAULT.tiers } };
  }
}

function clampTier(k: UpgradeKey, t: number): number {
  return Math.max(0, Math.min(UPGRADES[k].maxTier, Math.floor(t)));
}

function save(s: UpgradeState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function creditScore(score: number): UpgradeState {
  const s = loadUpgrades();
  s.points += Math.max(0, Math.floor(score / 10));
  save(s);
  return s;
}

export function purchase(key: UpgradeKey): { ok: boolean; state: UpgradeState } {
  const s = loadUpgrades();
  const def = UPGRADES[key];
  const cur = s.tiers[key];
  if (cur >= def.maxTier) return { ok: false, state: s };
  const cost = def.cost(cur);
  if (s.points < cost) return { ok: false, state: s };
  s.points -= cost;
  s.tiers[key] = cur + 1;
  save(s);
  return { ok: true, state: s };
}

export function getValue(key: UpgradeKey, s?: UpgradeState): number {
  const st = s ?? loadUpgrades();
  const def = UPGRADES[key];
  return def.values[st.tiers[key]];
}

export function nextCost(key: UpgradeKey, s?: UpgradeState): number | null {
  const st = s ?? loadUpgrades();
  const def = UPGRADES[key];
  const cur = st.tiers[key];
  if (cur >= def.maxTier) return null;
  return def.cost(cur);
}
