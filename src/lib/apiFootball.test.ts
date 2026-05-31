import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createApiFootballClient,
  API_FOOTBALL_BASE_URL,
  WC_LEAGUE,
  WC_SEASON,
  type ApiFixture,
  type ApiTeamEntry,
} from "./apiFootball";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const teamsBody = {
  response: [
    { team: { id: 6, name: "Brazil", code: "BRA" } },
    { team: { id: 2, name: "France", code: "FRA" } },
  ] satisfies ApiTeamEntry[],
};

const fixturesBody = {
  response: [
    {
      fixture: { id: 1001, date: "2026-06-11T20:00:00+00:00", status: { short: "NS" } },
      league: { round: "Group A - 1" },
      teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } },
      goals: { home: null, away: null },
    },
  ] satisfies ApiFixture[],
};

describe("createApiFootballClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the api key header and league/season query for fixtures", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixturesBody));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const fixtures = await client.getFixtures();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${API_FOOTBALL_BASE_URL}/fixtures`);
    expect(String(url)).toContain(`league=${WC_LEAGUE}`);
    expect(String(url)).toContain(`season=${WC_SEASON}`);
    expect((init as RequestInit).headers).toMatchObject({ "x-apisports-key": "KEY123" });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].fixture.id).toBe(1001);
  });

  it("getTeams returns the response array", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(teamsBody));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const teams = await client.getTeams();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${API_FOOTBALL_BASE_URL}/teams`);
    expect(teams.map((t) => t.team.id)).toEqual([6, 2]);
  });

  it("caches identical requests within the TTL (one network call)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixturesBody));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock, cacheTtlMs: 60_000 });

    await client.getFixtures();
    await client.getFixtures();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getFinishedFixtures filters to finished statuses (FT/AET/PEN)", async () => {
    const mixed = {
      response: [
        { fixture: { id: 1, date: "2026-06-11T20:00:00+00:00", status: { short: "FT" } }, league: { round: "Group A - 1" }, teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } }, goals: { home: 2, away: 1 } },
        { fixture: { id: 2, date: "2026-06-11T20:00:00+00:00", status: { short: "NS" } }, league: { round: "Group A - 2" }, teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } }, goals: { home: null, away: null } },
        { fixture: { id: 3, date: "2026-06-11T20:00:00+00:00", status: { short: "AET" } }, league: { round: "Round of 16" }, teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } }, goals: { home: 1, away: 1 } },
        { fixture: { id: 4, date: "2026-06-11T20:00:00+00:00", status: { short: "PEN" } }, league: { round: "Quarter-finals" }, teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } }, goals: { home: 0, away: 0 } },
      ] satisfies ApiFixture[],
    };
    const fetchMock = vi.fn(async () => jsonResponse(mixed));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const finished = await client.getFinishedFixtures();

    expect(finished.map((f) => f.fixture.id)).toEqual([1, 3, 4]);
  });

  it("exposes goals (normal + extra time) and excludes any penalty shootout", async () => {
    // A PEN match: goals carry the pre-shootout score; the shootout is NOT in goals.
    const penBody = {
      response: [
        {
          fixture: { id: 7, date: "2026-07-01T20:00:00+00:00", status: { short: "PEN" } },
          league: { round: "Round of 16" },
          teams: { home: { id: 6, name: "Brazil" }, away: { id: 2, name: "France" } },
          goals: { home: 1, away: 1 },
        },
      ] satisfies ApiFixture[],
    };
    const fetchMock = vi.fn(async () => jsonResponse(penBody));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const finished = await client.getFinishedFixtures();

    // The ApiFixture surface has no penalty field at all — goals is the only score.
    expect(finished[0].goals).toEqual({ home: 1, away: 1 });
    expect("penalty" in (finished[0] as Record<string, unknown>)).toBe(false);
  });

  it("throws on non-2xx responses", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 429 }));
    const client = createApiFootballClient({ apiKey: "KEY123", fetchFn: fetchMock });

    await expect(client.getFixtures()).rejects.toThrow(/API-Football request failed: 429/);
  });
});
