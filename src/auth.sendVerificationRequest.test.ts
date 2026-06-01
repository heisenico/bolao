import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock nodemailer so no real SMTP connection is ever opened. The mocks are
// defined via vi.hoisted so they exist before the hoisted vi.mock factory runs.
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMailMock: sendMail,
    createTransportMock: vi.fn(() => ({ sendMail })),
  };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

import { sendVerificationRequest } from "@/auth";

describe("sendVerificationRequest (Nodemailer / Gmail SMTP)", () => {
  const params = {
    identifier: "player@example.com",
    url: "http://localhost:3000/api/auth/callback/nodemailer?token=abc",
    provider: {
      server: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "me@gmail.com", pass: "app-password" },
      },
      from: "Bolão da Copa <me@gmail.com>",
    },
  };

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    sendMailMock.mockReset().mockResolvedValue({ messageId: "1" });
    createTransportMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Vitest pins process.env values as non-configurable; vi.stubEnv is the
    // supported mechanism. unstubAllEnvs restores originals after each test.
    vi.unstubAllEnvs();
  });

  it("logs the magic link and does NOT send when not in production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    await sendVerificationRequest({ ...params } as never);
    expect(sendMailMock).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).toContain(params.url);
    expect(logged).toContain(params.identifier);
  });

  it("logs the magic link and does NOT send when SMTP_USER is empty (even in production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "");
    await sendVerificationRequest({ ...params } as never);
    expect(sendMailMock).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).toContain(params.url);
  });

  it("sends the email via Nodemailer transport in production with SMTP_USER set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    await sendVerificationRequest({ ...params } as never);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith(params.provider.server);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0][0];
    expect(arg.to).toBe(params.identifier);
    expect(arg.from).toBe(params.provider.from);
    expect(arg.subject).toBeTruthy();
    expect(arg.text).toContain(params.url);
    expect(arg.html).toContain(params.url);
  });

  it("propagates a send failure (no silent swallow)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    sendMailMock.mockRejectedValue(new Error("SMTP 535 auth failed"));
    await expect(sendVerificationRequest({ ...params } as never)).rejects.toThrow(
      /SMTP 535/
    );
  });
});
