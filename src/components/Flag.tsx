import * as React from "react";

export interface FlagProps {
  codigoPais: string;
  className?: string;
}

const REGIONAL_INDICATOR_BASE = 0x1f1e6; // 🇦 — offset of 'A'

/**
 * Convert a 2-letter ISO country code to its regional-indicator emoji flag.
 * Returns null when the code is not exactly two ASCII letters.
 */
function toFlagEmoji(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    return null;
  }
  const codePoints = [...upper].map(
    (ch) => REGIONAL_INDICATOR_BASE + (ch.charCodeAt(0) - 65)
  );
  return String.fromCodePoint(...codePoints);
}

/**
 * Renders a country flag from `codigoPais`. Falls back to the raw code
 * (trimmed) when it cannot be mapped to a flag emoji.
 */
export function Flag({ codigoPais, className }: FlagProps) {
  const flag = toFlagEmoji(codigoPais);
  return (
    <span className={className} aria-label={codigoPais} role="img">
      {flag ?? codigoPais.trim()}
    </span>
  );
}
