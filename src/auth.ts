import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

type SendParams = {
  identifier: string;
  url: string;
  // Mirrors the relevant slice of next-auth's NodemailerConfig used here. The
  // dev-fallback branch handles an empty SMTP_USER (no transport needed).
  provider: { server?: unknown; from?: string };
};

/**
 * Dev fallback: when NODE_ENV !== 'production' OR no SMTP user is set, log the
 * magic-link URL to the server console instead of sending an email. In
 * production with SMTP credentials, send via Gmail SMTP using Nodemailer.
 */
export async function sendVerificationRequest(params: SendParams): Promise<void> {
  const { identifier, url, provider } = params;

  if (process.env.NODE_ENV !== "production" || !env.smtpUser()) {
    console.log(`[auth] Magic link for ${identifier}: ${url}`);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(provider.server as never);
  await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: "Entrar no Bolão da Copa 2026",
    text: `Seu link de acesso: ${url}`,
    html: `
      <div style="font-family: 'Open Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #c4170c; margin: 0 0 16px;">Bolão da Copa 2026</h2>
        <p>Clique no botão abaixo para entrar:</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #c4170c; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: 600;">Entrar</a>
        </p>
        <p style="font-size: 13px; color: #666;">Ou copie e cole este link no navegador:<br><a href="${url}">${url}</a></p>
        <p style="font-size: 13px; color: #666;">Se você não solicitou este e-mail, ignore-o.</p>
      </div>
    `,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Nodemailer({
      server: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: env.smtpUser(), pass: env.smtpPass() },
      },
      from: env.emailFrom(),
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
