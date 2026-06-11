"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { reaisToCents } from "@/lib/money";
import { createPool } from "@/server/pools";

export async function createPoolAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const nome = String(formData.get("nome") ?? "").trim();
  const valorEntradaRaw = String(formData.get("valorEntrada") ?? "0");
  const chavePix = String(formData.get("chavePix") ?? "").trim();

  if (!nome) throw new Error("Informe o nome do bolão");

  // reaisToCents throws on invalid/negative input (no silent fallback). 0 (or
  // empty) = free pool; createPool then requires/discards the Pix key as needed.
  const valorEntrada = reaisToCents(valorEntradaRaw);

  const pool = await createPool({
    ownerId: session.user.id,
    nome,
    valorEntrada,
    chavePix: chavePix === "" ? null : chavePix,
  });

  // Success moment: land on the invite screen with the code front and center.
  redirect(`/pools/${pool.id}/convite`);
}
