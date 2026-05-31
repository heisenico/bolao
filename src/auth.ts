import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

type SendParams = {
  identifier: string;
  url: string;
  // Mirrors the relevant slice of next-auth's EmailConfig, where both fields
  // are optional; the dev-fallback branch handles a missing/empty apiKey.
  provider: { apiKey?: string; from?: string };
};

/**
 * Dev fallback: when NODE_ENV !== 'production' OR no Resend API key is set,
 * log the magic-link URL to the server console instead of sending an email.
 * In production with a key, POST to the Resend HTTP API.
 */
export async function sendVerificationRequest(params: SendParams): Promise<void> {
  const { identifier, url, provider } = params;
  const apiKey = provider.apiKey;

  if (process.env.NODE_ENV !== "production" || !apiKey) {
    console.log(
      `\n[auth] Magic link for ${identifier}:\n${url}\n(dev fallback — no email sent)\n`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: provider.from,
      to: identifier,
      subject: "Seu link de acesso — Bolão da Copa 2026",
      html: `<p>Clique para entrar no Bolão da Copa 2026:</p><p><a href="${url}">Entrar</a></p><p>Se você não solicitou este e-mail, ignore-o.</p>`,
      text: `Entre no Bolão da Copa 2026: ${url}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "",
      from: process.env.AUTH_EMAIL_FROM ?? "Bolão da Copa <onboarding@resend.dev>",
      sendVerificationRequest,
    }),
  ],
  callbacks: {
    // Database-session shape: copy the adapter user's id onto session.user.id
    // so callers can read session.user.id at runtime (typed via src/types/next-auth.d.ts).
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
  },
});
