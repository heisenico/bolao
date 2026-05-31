"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { reaisToCents } from "@/lib/money";
import { createPool } from "@/server/pools";

export async function createPoolAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const nome = String(formData.get("nome") ?? "").trim();
  const valorEntradaRaw = String(formData.get("valorEntrada") ?? "");
  const chavePix = String(formData.get("chavePix") ?? "").trim();

  if (!nome) throw new Error("Informe o nome do bolão");
  if (!chavePix) throw new Error("Informe a chave PIX");

  // reaisToCents throws on invalid/negative input (no silent fallback).
  const valorEntrada = reaisToCents(valorEntradaRaw);

  const pool = await createPool({
    ownerId: session.user.id,
    nome,
    valorEntrada,
    chavePix,
  });

  redirect(`/join/${pool.inviteCode}`);
}
