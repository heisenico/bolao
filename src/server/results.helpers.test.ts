import { describe, it, expect } from 'vitest'
import {
  fixtureToScore,
  hasFinalScore,
  stageToPhase,
  statusToMatchStatus,
} from './results'
import type { FdMatch } from '@/lib/footballData'

function fx(
  home: number | null,
  away: number | null,
  status = 'FINISHED',
  stage = 'GROUP_STAGE',
): FdMatch {
  return {
    id: 1,
    utcDate: '2026-06-11T20:00:00Z',
    stage,
    group: 'Group A',
    status,
    homeTeam: { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'France', tla: 'FRA', crest: null },
    score: { winner: null, duration: 'REGULAR', fullTime: { home, away } },
  }
}

describe('hasFinalScore', () => {
  it('true only when FINISHED and fullTime.home is a number', () => {
    expect(hasFinalScore(fx(2, 1, 'FINISHED'))).toBe(true)
  })
  it('false when not FINISHED even if scores exist', () => {
    expect(hasFinalScore(fx(2, 1, 'IN_PLAY'))).toBe(false)
  })
  it('false when fullTime is null', () => {
    expect(hasFinalScore(fx(null, 1, 'FINISHED'))).toBe(false)
    expect(hasFinalScore(fx(2, null, 'FINISHED'))).toBe(false)
  })
})

describe('fixtureToScore', () => {
  it('extracts fullTime home/away as a Score', () => {
    expect(fixtureToScore(fx(3, 0))).toEqual({ home: 3, away: 0 })
  })
  it('throws if there is no final score', () => {
    expect(() => fixtureToScore(fx(null, null))).toThrow(/final score/i)
  })
  it('reads fullTime (normal + extra time) only — a penalty shootout is excluded', () => {
    // fullTime carries the 1-1 after extra time; the shootout winner is not
    // reflected, so the score stays a draw (CONTRACT §4, §11.10).
    const pen = fx(1, 1, 'FINISHED', 'LAST_16')
    expect(fixtureToScore(pen)).toEqual({ home: 1, away: 1 })
  })
})

describe('stageToPhase', () => {
  it('maps football-data.org stages to MatchPhase (CONTRACT §11.10)', () => {
    expect(stageToPhase('GROUP_STAGE')).toBe('grupos')
    expect(stageToPhase('LAST_32')).toBe('r32')
    expect(stageToPhase('LAST_16')).toBe('oitavas')
    expect(stageToPhase('QUARTER_FINALS')).toBe('quartas')
    expect(stageToPhase('SEMI_FINALS')).toBe('semi')
    expect(stageToPhase('THIRD_PLACE')).toBe('terceiro')
    expect(stageToPhase('FINAL')).toBe('final')
  })

  it('does not confuse THIRD_PLACE / SEMI_FINALS / QUARTER_FINALS with FINAL', () => {
    expect(stageToPhase('THIRD_PLACE')).not.toBe('final')
    expect(stageToPhase('SEMI_FINALS')).not.toBe('final')
    expect(stageToPhase('QUARTER_FINALS')).not.toBe('final')
    expect(stageToPhase('FINAL')).toBe('final')
  })

  it('defaults unknown or empty stages to grupos', () => {
    expect(stageToPhase('')).toBe('grupos')
    expect(stageToPhase('PRELIMINARY')).toBe('grupos')
  })
})

describe('statusToMatchStatus', () => {
  it('maps football-data.org statuses to MatchStatus (CONTRACT §11.10)', () => {
    expect(statusToMatchStatus('SCHEDULED')).toBe('agendada')
    expect(statusToMatchStatus('TIMED')).toBe('agendada')
    expect(statusToMatchStatus('IN_PLAY')).toBe('ao_vivo')
    expect(statusToMatchStatus('PAUSED')).toBe('ao_vivo')
    expect(statusToMatchStatus('FINISHED')).toBe('encerrada')
    expect(statusToMatchStatus('POSTPONED')).toBe('adiada')
    expect(statusToMatchStatus('CANCELLED')).toBe('cancelada')
    expect(statusToMatchStatus('SUSPENDED')).toBe('cancelada')
  })

  it('defaults unknown statuses to agendada', () => {
    expect(statusToMatchStatus('AWARDED')).toBe('agendada')
    expect(statusToMatchStatus('')).toBe('agendada')
  })
})
