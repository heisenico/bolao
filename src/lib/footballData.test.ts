import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFootballDataClient,
  FOOTBALL_DATA_BASE_URL,
  WC_COMPETITION,
  WC_SEASON,
  type FdMatch,
  type FdTeam,
} from "./footballData";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fdMatch(over?: Partial<FdMatch>): FdMatch {
  return {
    id: 1001,
    utcDate: "2026-06-11T20:00:00Z",
    stage: "GROUP_STAGE",
    group: "Group A",
    status: "SCHEDULED",
    homeTeam: { id: 6, name: "Brazil", tla: "BRA", crest: null },
    awayTeam: { id: 2, name: "France", tla: "FRA", crest: null },
    score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
    ...over,
  };
}

const teamsBody = {
  teams: [
    { id: 6, name: "Brazil", tla: "BRA", crest: null },
    { id: 2, name: "France", tla: "FRA", crest: null },
  ] satisfies FdTeam[],
};

describe("createFootballDataClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the X-Auth-Token header and competition/season query for matches", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ matches: [fdMatch()] }),
    );
    const client = createFootballDataClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const matches = await client.getMatches();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${FOOTBALL_DATA_BASE_URL}/competitions/${WC_COMPETITION}/matches`);
    expect(String(url)).toContain(`season=${WC_SEASON}`);
    expect(init?.headers).toMatchObject({ "X-Auth-Token": "KEY123" });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(1001);
    expect(matches[0].homeTeam.tla).toBe("BRA");
  });

  it("getTeams returns the teams array", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(teamsBody),
    );
    const client = createFootballDataClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const teams = await client.getTeams();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${FOOTBALL_DATA_BASE_URL}/competitions/${WC_COMPETITION}/teams`);
    expect(teams.map((t) => t.id)).toEqual([6, 2]);
  });

  it("getFinishedMatches requests the FINISHED status filter", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        matches: [
          fdMatch({
            status: "FINISHED",
            score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } },
          }),
        ],
      }),
    );
    const client = createFootballDataClient({ apiKey: "KEY123", fetchFn: fetchMock });

    const finished = await client.getFinishedMatches();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("status=FINISHED");
    expect(finished).toHaveLength(1);
    expect(finished[0].status).toBe("FINISHED");
    expect(finished[0].score.fullTime).toEqual({ home: 2, away: 1 });
  });

  it("caches identical requests within the TTL (one network call)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ matches: [fdMatch()] }));
    const client = createFootballDataClient({
      apiKey: "KEY123",
      fetchFn: fetchMock,
      cacheTtlMs: 60_000,
    });

    await client.getMatches();
    await client.getMatches();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getMatches and getFinishedMatches are cached independently (different URLs)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ matches: [fdMatch()] }));
    const client = createFootballDataClient({
      apiKey: "KEY123",
      fetchFn: fetchMock,
      cacheTtlMs: 60_000,
    });

    await client.getMatches();
    await client.getFinishedMatches();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws with status and the response message/errorCode on a 403", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { message: "The resource you are looking for is restricted.", errorCode: 403 },
        403,
      ),
    );
    const client = createFootballDataClient({ apiKey: "KEY123", fetchFn: fetchMock });

    await expect(client.getMatches()).rejects.toThrow(/403/);
    await expect(client.getMatches()).rejects.toThrow(/restricted/i);
  });

  it("throws with status on a 429 (rate limit) even with a non-JSON body", async () => {
    const fetchMock = vi.fn(async () => new Response("Too Many Requests", { status: 429 }));
    const client = createFootballDataClient({ apiKey: "KEY123", fetchFn: fetchMock });

    await expect(client.getMatches()).rejects.toThrow(/429/);
  });

  it("surfaces the errorCode in the thrown message when present", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: "Your API token is invalid.", errorCode: 400 }, 400),
    );
    const client = createFootballDataClient({ apiKey: "BAD", fetchFn: fetchMock });

    await expect(client.getMatches()).rejects.toThrow(/Your API token is invalid/i);
  });
});
