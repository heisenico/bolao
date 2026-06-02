import * as React from "react";

export interface FlagProps {
  codigoPais: string;
  /** Crest/flag image URL (football-data.org). Preferred over the emoji when set. */
  bandeira?: string | null;
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
 * Renders a team flag. When `bandeira` is a non-empty URL, renders that crest
 * image (alt = codigoPais). Otherwise falls back to the regional-indicator emoji
 * from `codigoPais`, then to the raw code (trimmed) when it is not a 2-letter code.
 */
export function Flag({ codigoPais, bandeira, className }: FlagProps) {
  if (bandeira && bandeira.trim() !== "") {
    return (
      // Plain <img> (not next/image): remote crest URLs, no loader config in v1.
      // alt="" (decorative): the team name is always rendered adjacent, so the
      // crest is redundant for AT and an empty alt avoids a double announcement.
      // Intrinsic width/height reserve layout space (avoids CLS); class still sizes it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={bandeira}
        alt=""
        width={24}
        height={16}
        loading="lazy"
        decoding="async"
        className={className}
      />
    );
  }
  const flag = toFlagEmoji(codigoPais);
  return (
    <span className={className} aria-label={codigoPais} role="img">
      {flag ?? codigoPais.trim()}
    </span>
  );
}
