import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendVerificationRequest } from "@/auth";

describe("sendVerificationRequest", () => {
  const params = {
    identifier: "player@example.com",
    url: "http://localhost:3000/api/auth/callback/resend?token=abc",
    provider: { apiKey: "", from: "Bolão <onboarding@resend.dev>" },
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Vitest pins process.env.NODE_ENV as a non-configurable property, so the
    // plan's Object.defineProperty cannot mutate it; vi.stubEnv is the supported
    // mechanism. unstubAllEnvs restores the original value after each test.
    vi.unstubAllEnvs();
  });

  it("logs the magic link to the console and does NOT call fetch when no apiKey is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await sendVerificationRequest({ ...params, provider: { ...params.provider, apiKey: "" } } as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).toContain(params.url);
    expect(logged).toContain(params.identifier);
  });

  it("POSTs to the Resend API when an apiKey is present in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sendVerificationRequest({
      ...params,
      provider: { ...params.provider, apiKey: "re_test_key" },
    } as never);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
  });

  it("throws when the Resend API responds with a non-OK status", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchSpy.mockResolvedValue(new Response('{"message":"bad"}', { status: 422 }));
    await expect(
      sendVerificationRequest({
        ...params,
        provider: { ...params.provider, apiKey: "re_test_key" },
      } as never)
    ).rejects.toThrow(/Resend/);
  });
});
