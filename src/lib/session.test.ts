import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

import { requireSession } from "@/lib/session";

describe("requireSession", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
  });

  it("returns the session when a user is authenticated", async () => {
    const session = { user: { id: "u1", email: "a@b.com" }, expires: "2099-01-01" };
    authMock.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session has no user", async () => {
    authMock.mockResolvedValue({ expires: "2099-01-01" });
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
