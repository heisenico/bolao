// Typed football-data.org v4 client. fetch-based, in-memory TTL cache.
// Free tier is 10 req/min (CONTRACT §11.10). Always scoped to competition WC,
// season 2026. fetchFn + apiKey are injectable so callers/tests control I/O.
//
// Replaces the API-Football (api-sports.io) client: api-sports free is locked to
// seasons 2022-2024 and cannot serve WC2026; football-data.org free returns the
// full 104-match schedule.

import { env } from "@/lib/env";

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
export const WC_COMPETITION = "WC";
export const WC_SEASON = 2026;

/** A team as returned by /competitions/WC/teams and embedded in matches. */
export interface FdTeam {
  id: number;
  name: string;
  tla: string | null;
  crest: string | null;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  stage: string;
  group: string | null;
  status: string;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  // `score.fullTime` is the result after normal + extra time. It EXCLUDES any
  // penalty shootout, so a 1-1 that went to penalties stays a draw here, which
  // matches the scoring rule (CONTRACT §4, §11.10).
  score: {
    winner: string | null;
    duration: string;
    fullTime: { home: number | null; away: number | null };
  };
}

interface FdMatchesEnvelope {
  matches: FdMatch[];
}

interface FdTeamsEnvelope {
  teams: FdTeam[];
}

export interface FootballDataClient {
  getMatches(): Promise<FdMatch[]>;
  getTeams(): Promise<FdTeam[]>;
  getFinishedMatches(): Promise<FdMatch[]>;
}

export interface FootballDataClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  cacheTtlMs?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min: dedupes bursts, preserves the 10 req/min budget.

/** Pulls the human-readable error out of a football-data.org error body. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; errorCode?: number };
    const parts: string[] = [];
    if (body.message) parts.push(body.message);
    if (body.errorCode !== undefined) parts.push(`errorCode=${body.errorCode}`);
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // Non-JSON body (e.g. a bare "Too Many Requests"): fall through to the text.
  }
  try {
    const text = await res.clone().text();
    if (text) return text;
  } catch {
    // ignore
  }
  return "";
}

export function createFootballDataClient(
  options: FootballDataClientOptions,
): FootballDataClient {
  const fetchFn = options.fetchFn ?? fetch;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  async function get<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${FOOTBALL_DATA_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const key = url.toString();

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const res = await fetchFn(url.toString(), {
      headers: { "X-Auth-Token": options.apiKey },
    });
    if (!res.ok) {
      // Surface the failure LOUDLY: include the HTTP status AND the body's
      // message/errorCode. The old api-sports client silently returned an empty
      // array on errors (CONTRACT §11.10), masking quota/plan failures.
      const detail = await errorDetail(res);
      const suffix = detail ? `: ${detail}` : "";
      throw new Error(`football-data.org request failed (${res.status})${suffix}`);
    }
    const body = (await res.json()) as T;
    cache.set(key, { value: body, expiresAt: Date.now() + cacheTtlMs });
    return body;
  }

  return {
    async getMatches() {
      const body = await get<FdMatchesEnvelope>(`/competitions/${WC_COMPETITION}/matches`, {
        season: WC_SEASON,
      });
      return body.matches ?? [];
    },
    async getTeams() {
      const body = await get<FdTeamsEnvelope>(`/competitions/${WC_COMPETITION}/teams`, {
        season: WC_SEASON,
      });
      return body.teams ?? [];
    },
    async getFinishedMatches() {
      const body = await get<FdMatchesEnvelope>(`/competitions/${WC_COMPETITION}/matches`, {
        season: WC_SEASON,
        status: "FINISHED",
      });
      return body.matches ?? [];
    },
  };
}

/** Builds the default football-data.org client from env (server-only). */
export function defaultFootballDataClient(): FootballDataClient {
  return createFootballDataClient({ apiKey: env.footballDataKey() });
}
