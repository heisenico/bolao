import "server-only";

/**
 * Server-only typed access to required environment variables.
 * Throws (instead of returning undefined) so missing config fails loudly at use.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: () => requireEnv("DATABASE_URL"),
  directUrl: () => requireEnv("DIRECT_URL"),
  authSecret: () => requireEnv("AUTH_SECRET"),
  authResendKey: () => process.env.AUTH_RESEND_KEY ?? "",
  emailFrom: () => process.env.AUTH_EMAIL_FROM ?? "Bolão da Copa <onboarding@resend.dev>",
  authUrl: () => process.env.AUTH_URL ?? "http://localhost:3000",
  apiFootballKey: () => requireEnv("API_FOOTBALL_KEY"),
  footballDataKey: () => requireEnv("FOOTBALL_DATA_KEY"),
  pollSecret: () => requireEnv("POLL_SECRET"),
};
