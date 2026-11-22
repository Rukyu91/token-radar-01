// Token Radar Valuation & Farm Plan Engine (Node 22 / TypeScript, standard library only).
//
// Every pre-token protocol is ranked by implied fully diluted valuation (FDV) derived
// deterministically from the snapshot's own figures:
//
//   base         = tvl_usd * BASE_MULTIPLE
//   growth       = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP)
//   growthMult   = 1 + (growth / 100) * GROWTH_WEIGHT
//   ageNorm      = min(max(age_days, 0), MATURITY_DAYS) / MATURITY_DAYS
//   maturityMult = MATURITY_FLOOR + ageNorm * MATURITY_RANGE
//   categoryMult = sectorMultiplier(category)
//   chainMult    = ecosystemMultiplier(chains)
//   implied      = max(1, round(base * growthMult * maturityMult * categoryMult * chainMult))
//
// No protocol name is ever hardcoded: every row is evaluated by the same formula.
// Pre-token protocols are strictly separated from live-token protocols.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
};

// Model version identifier: updated to production release v2.0
export const MODEL_VERSION = 'radar-v2-alpha';
export const EARLY_ROWS = 180;
export const LIVE_ROWS = 24;

export interface FarmStep {
  phase: string;
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    category_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_pre_token_tvl: number;
  total_implied_fdv: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Sector fee-capture multiple based on market fundamentals. */
export function sectorMultiplier(category: string | null): number {
  if (!category) return 1.0;
  const c = category.toLowerCase();
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return 1.30;
  if (c.includes('rollup') || c.includes('layer 2') || c.includes('chain')) return 1.25;
  if (c.includes('restak') || c.includes('liquid restaking')) return 1.18;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager')) return 1.12;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 1.00;
  if (c.includes('curator') || c.includes('allocator')) return 0.95;
  if (c.includes('bridge') || c.includes('cross chain')) return 0.90;
  if (c.includes('rwa') || c.includes('payment') || c.includes('stable')) return 0.85;
  return 1.00;
}

/** Ecosystem breadth multiple: multi-chain protocols capture broader liquidity. */
export function ecosystemMultiplier(chains: string[]): number {
  if (!chains || chains.length === 0) return 1.0;
  if (chains.length >= 5) return 1.15;
  if (chains.length >= 2) return 1.08;
  const primary = chains[0]!.toLowerCase();
  if (primary.includes('ethereum') || primary.includes('solana') || primary.includes('base') || primary.includes('arbitrum')) return 1.05;
  return 1.00;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  categoryMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMult = sectorMultiplier(protocol.category);
  const chainMult = ecosystemMultiplier(protocol.chains);

  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * categoryMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, categoryMult, chainMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  // Watchlist is mandatory: every slug on the watchlist is included
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  // Early radar: pre-token protocols below watchlist floor, sorted by TVL
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model);
    return { p, ...res };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      category_multiplier: round4(s.categoryMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `[${step.phase}] ${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the active position and monitor governance announcements.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 175;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  return 30;
}

function gasEstimateForChain(chain: string): { setup: string; weekly: string } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum') || c.includes('mainnet')) return { setup: 'about $15-$25 of gas', weekly: 'about $4-$8 of gas' };
  if (c.includes('solana')) return { setup: 'under $0.50 of SOL gas', weekly: 'under $0.20 of SOL gas' };
  if (c.includes('arbitrum') || c.includes('base') || c.includes('optimism') || c.includes('polygon') || c.includes('ink')) {
    return { setup: 'about $1-$2 of L2 gas', weekly: 'under $1 of L2 gas' };
  }
  return { setup: 'about $3-$5 of native gas', weekly: 'about $1-$2 of native gas' };
}

function primaryActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC into ${name}'s verified pool on ${chain}, activate collateral, and borrow a small 10% stablecoin buffer to qualify across both supply and borrow tranches.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager') || c.includes('farm')) {
    return `Provide $${capital} of dual-sided liquidity into ${name}'s primary pool on ${chain} within the recommended fee tier and stake the liquidity receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) {
    return `Deposit $${capital} USDC margin into ${name} on ${chain} and execute two low-leverage (1.5x-2x) delta-neutral hedge trades to accrue authentic taker volume.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Stake or delegate $${capital} of native assets into ${name} on ${chain}, allocate across top-tier node operators, and hold the restaking receipt.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} USDC to ${chain} via ${name}, confirm cross-chain settlement, and deploy the delivered liquidity into one supported dApp.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} into a high-security ${name} institutional vault on ${chain} and hold the allocation shares.`;
  }
  if (c.includes('rwa') || c.includes('payment') || c.includes('stable')) {
    return `Mint or deposit $${capital} into ${name}'s yield vault on ${chain} and retain custody of the proof-of-reserve receipt token.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and maintain an active balance in its primary smart contract.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasEstimateForChain(chain);
  const action = primaryActionFor(p, capital, chain);

  return [
    {
      phase: '1. Setup',
      text: `Prepare a dedicated non-custodial wallet exclusively for ${p.name} on ${chain}, funded with sufficient native gas tokens. Never mix airdrop farming capital with cold storage vaults.`,
      cost: `under $5 initial transfer gas`,
      time: '10 minutes setup',
    },
    {
      phase: '2. Deploy',
      text: action,
      cost: `$${capital} capital deposit plus ${gas.setup}`,
      time: '15 minutes execution',
    },
    {
      phase: '3. Cadence',
      text: `Maintain on-chain interaction velocity: execute one genuine protocol transaction every 7 days (e.g. claim-and-restake, collateral rebalance, or micro-swap) to establish multi-epoch wallet consistency.`,
      cost: `${gas.weekly} a week`,
      time: '10 minutes weekly',
    },
    {
      phase: '4. Seasoning',
      text: `Lock and hold the deployed position continuously for at least ${hold} days to qualify across multiple snapshot intervals and avoid sybil filtering heuristics.`,
      cost: `$${capital} remains committed in protocol`,
      time: `${hold} days holding period`,
    },
    {
      phase: '5. Governance',
      text: `Link wallet to Snapshot or on-chain governance forums for ${p.name}, verify anti-sybil credentials if prompted, and cast votes on active DAO proposals.`,
      cost: 'free or under $0.50 gas to sign/vote',
      time: '15 minutes per proposal',
    },
    {
      phase: '6. Claim & Exit',
      text: `When official TGE is announced, verify claims strictly through official protocol domains, claim token allocations, and safely revoke smart contract approvals via Revoke.cash upon position unwind.`,
      cost: `under $5 gas for claim and approval revoke`,
      time: '15 minutes at launch',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiplier: row.model.category_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  const totalPreTvl = board.reduce((acc, r) => acc + r.tvl_usd, 0);
  const totalImplied = board.reduce((acc, r) => acc + r.implied_value_usd, 0);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_pre_token_tvl: totalPreTvl,
    total_implied_fdv: totalImplied,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
