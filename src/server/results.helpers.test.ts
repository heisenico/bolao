import { describe, it, expect } from 'vitest'
import { fixtureToScore, hasFinalScore, roundToPhase } from './results'
import type { ApiFixture } from '@/lib/apiFootball'

function fx(
  goalsHome: number | null,
  goalsAway: number | null,
  short = 'FT',
  round = 'Group A - 1',
): ApiFixture {
  return {
    fixture: { id: 1, date: '2026-06-11T20:00:00+00:00', status: { short } },
    league: { round },
    teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
    goals: { home: goalsHome, away: goalsAway },
  }
}

describe('hasFinalScore', () => {
  it('true when both goals are numbers', () => {
    expect(hasFinalScore(fx(2, 1))).toBe(true)
  })
  it('false when either goal is null', () => {
    expect(hasFinalScore(fx(null, 1))).toBe(false)
    expect(hasFinalScore(fx(2, null))).toBe(false)
  })
})

describe('fixtureToScore', () => {
  it('extracts home/away goals as a Score', () => {
    expect(fixtureToScore(fx(3, 0))).toEqual({ home: 3, away: 0 })
  })
  it('throws if goals are not final', () => {
    expect(() => fixtureToScore(fx(null, null))).toThrow(/final score/i)
  })
  it('reads goals (normal + extra time) only — a PEN match excludes the shootout', () => {
    // A penalty shootout match: goals carry the 1-1 result after extra time.
    // The shootout winner is NOT reflected here, so the score stays a draw.
    const pen = fx(1, 1, 'PEN', 'Round of 16')
    expect(fixtureToScore(pen)).toEqual({ home: 1, away: 1 })
  })
})

describe('roundToPhase', () => {
  it('maps API-Football round labels to MatchPhase (CONTRACT §11.6)', () => {
    expect(roundToPhase('Group A - 1')).toBe('grupos')
    expect(roundToPhase('Group H - 3')).toBe('grupos')
    expect(roundToPhase('Round of 32')).toBe('r32')
    expect(roundToPhase('Round of 16')).toBe('oitavas')
    expect(roundToPhase('Quarter-finals')).toBe('quartas')
    expect(roundToPhase('Semi-finals')).toBe('semi')
    expect(roundToPhase('3rd Place Final')).toBe('terceiro')
    expect(roundToPhase('Final')).toBe('final')
  })

  it('does not confuse Semi/Quarter/3rd-Place with the plain Final', () => {
    expect(roundToPhase('Semi-finals')).not.toBe('final')
    expect(roundToPhase('Quarter-finals')).not.toBe('final')
    expect(roundToPhase('3rd Place Final')).not.toBe('final')
    expect(roundToPhase('Final')).toBe('final')
  })

  it('defaults unknown or empty rounds to grupos', () => {
    expect(roundToPhase('')).toBe('grupos')
    expect(roundToPhase('Some Unknown Stage')).toBe('grupos')
  })
})
