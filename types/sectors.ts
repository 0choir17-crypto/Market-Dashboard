export type SectorData = {
  date: string
  sector_name: string
  chg_1d_pct:   number | null
  chg_5d_pct:   number | null
  chg_21d_pct:  number | null
  pct_from_52wh: number | null
  dist_sma25_pct: number | null
  dist_sma50_pct: number | null
  dist_ema21_pct: number | null

  // RS columns — optional until ALTER TABLE (Part 1 SQL) has been run
  rs_1d?:     number | null
  rs_1w?:     number | null
  rs_1m?:     number | null
  rs_chg_1w?: number | null
  rs_chg_1m?: number | null
}

export type Quadrant = 'leader' | 'improving' | 'weakening' | 'lagging'

export function getQuadrant(sector: SectorData): Quadrant {
  const mid = sector.chg_21d_pct ?? 0
  const mom = sector.chg_5d_pct  ?? 0
  if (mid >  0 && mom >  0) return 'leader'
  if (mid <= 0 && mom >  0) return 'improving'
  if (mid >  0 && mom <= 0) return 'weakening'
  return 'lagging'
}

export const QUADRANT_CONFIG = {
  leader:    { label: 'Leader',    color: '#16a34a', bg: '#dcfce7', emoji: '🟢' },
  improving: { label: 'Improving', color: '#2563eb', bg: '#dbeafe', emoji: '🔵' },
  weakening: { label: 'Weakening', color: '#d97706', bg: '#fef3c7', emoji: '🟡' },
  lagging:   { label: 'Lagging',   color: '#dc2626', bg: '#fee2e2', emoji: '🔴' },
} as const
