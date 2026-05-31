// Typed API-Football (api-sports.io) client. fetch-based, in-memory TTL cache.
// Budget-aware: 100 req/day free tier (CONTRACT §1, §11.6). Always scoped to
// league=1, season=2026. fetchFn + apiKey are injectable so callers/tests control I/O.

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const WC_LEAGUE = 1;
export const WC_SEASON = 2026;

/** Statuses that mean the match is over and the final score is authoritative. */
export const FINISHED_STATUSES = ["FT", "AET", "PEN"] as const;
export type FinishedStatus = (typeof FINISHED_STATUSES)[number];

export interface ApiTeamEntry {
  team: { id: number; name: string; code: string | null };
}

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  // API-Football nests the round label here (e.g. "Group A - 1", "Round of 16").
  league: { round: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  // Goals are the score after normal + extra time. The penalty shootout, if any,
  // lives in `score.penalty` (not modeled here) and is intentionally excluded
  // from scoring (CONTRACT §4, §11.6).
  goals: { home: number | null; away: number | null };
}

interface ApiEnvelope<T> {
  response: T[];
}

export interface ApiFootballClient {
  getTeams(): Promise<ApiTeamEntry[]>;
  getFixtures(): Promise<ApiFixture[]>;
  getFinishedFixtures(): Promise<ApiFixture[]>;
}

export interface ApiFootballClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  cacheTtlMs?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min: dedupes bursts, preserves quota.

export function createApiFootballClient(options: ApiFootballClientOptions): ApiFootballClient {
  const fetchFn = options.fetchFn ?? fetch;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  async function get<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
    const url = new URL(`${API_FOOTBALL_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const key = url.toString();

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T[];
    }

    const res = await fetchFn(url.toString(), {
      headers: { "x-apisports-key": options.apiKey },
    });
    if (!res.ok) {
      throw new Error(`API-Football request failed: ${res.status}`);
    }
    const body = (await res.json()) as ApiEnvelope<T>;
    const value = body.response ?? [];
    cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
    return value;
  }

  return {
    getTeams() {
      return get<ApiTeamEntry>("/teams", { league: WC_LEAGUE, season: WC_SEASON });
    },
    getFixtures() {
      return get<ApiFixture>("/fixtures", { league: WC_LEAGUE, season: WC_SEASON });
    },
    async getFinishedFixtures() {
      const all = await get<ApiFixture>("/fixtures", { league: WC_LEAGUE, season: WC_SEASON });
      return all.filter((f) =>
        (FINISHED_STATUSES as readonly string[]).includes(f.fixture.status.short),
      );
    },
  };
}
