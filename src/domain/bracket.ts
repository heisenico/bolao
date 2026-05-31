/**
 * Pure bracket builder (CONTRACT §2 domain boundary): no next/prisma imports.
 * Knockout starts at r32 (CONTRACT §3 MatchPhase). Group matches are dropped.
 */
export type KnockoutPhase = 'r32' | 'oitavas' | 'quartas' | 'semi' | 'terceiro' | 'final'

export const KNOCKOUT_PHASES: KnockoutPhase[] = [
  'r32',
  'oitavas',
  'quartas',
  'semi',
  'terceiro',
  'final',
]

export interface BracketMatch {
  id: string
  fase: string
  dataHora: Date
  homeNome: string
  awayNome: string
  homeCodigoPais: string
  awayCodigoPais: string
  homeBandeira: string | null
  awayBandeira: string | null
  placarHome: number | null
  placarAway: number | null
}

export interface BracketColumn {
  fase: KnockoutPhase
  matches: BracketMatch[]
}

function isKnockout(fase: string): fase is KnockoutPhase {
  return (KNOCKOUT_PHASES as string[]).includes(fase)
}

/** Group matches into ordered knockout columns (r32..final), sorted by kickoff. */
export function buildBracket(matches: BracketMatch[]): BracketColumn[] {
  return KNOCKOUT_PHASES.map((fase) => ({
    fase,
    matches: matches
      .filter((mt) => isKnockout(mt.fase) && mt.fase === fase)
      .slice()
      .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime()),
  }))
}
