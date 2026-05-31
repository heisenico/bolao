// Money is stored as integer BRL cents everywhere; format only at the edge.

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Parse a reais string (accepts "25", "25.50", "25,50") into integer cents. */
export function reaisToCents(input: string): number {
  const normalized = input.trim().replace(",", ".");
  const reais = Number(normalized);
  if (!Number.isFinite(reais) || reais < 0) {
    throw new Error(`Valor de entrada inválido: ${input}`);
  }
  return Math.round(reais * 100);
}

/** Render integer BRL cents as a pt-BR currency string, e.g. 2550 -> "R$ 25,50". */
export function formatCentsBRL(cents: number): string {
  // Intl uses a non-breaking space (U+00A0) between the symbol and the number;
  // normalize it to a regular space so callers and tests get a plain "R$ 25,50".
  return BRL_FORMATTER.format(cents / 100).replace(/\u00A0/g, " ");
}
