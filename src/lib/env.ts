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
  smtpUser: () => process.env.SMTP_USER ?? "",
  smtpPass: () => process.env.SMTP_PASS ?? "",
  emailFrom: () => process.env.AUTH_EMAIL_FROM ?? "Bolão da Copa <no-reply@localhost>",
  authUrl: () => process.env.AUTH_URL ?? "http://localhost:3000",
  footballDataKey: () => requireEnv("FOOTBALL_DATA_KEY"),
  pollSecret: () => requireEnv("POLL_SECRET"),
};
