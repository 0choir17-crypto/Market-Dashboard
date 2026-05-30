export type ScanResultRow = {
  date: string
  code: string
  signal: string | null
  name: string | null
  sector: string | null
  rs_topix_21d: number | null
  rs_sector_21d: number | null
  atr_ext_sma50: number | null
}

// Raw row shape from `scan_results` — actual columns may use legacy aliases
// (e.g. `company_name`, `sector_s33`). We normalize on the client.
export type RawScanResultRow = {
  date: string
  code: string
  signal?: string | null
  name?: string | null
  company_name?: string | null
  sector?: string | null
  sector_s33?: string | null
  rs_topix_21d?: number | null
  rs_sector_21d?: number | null
  atr_ext_sma50?: number | null
}

export function normalizeScanRow(r: RawScanResultRow): ScanResultRow {
  return {
    date: r.date,
    code: r.code,
    signal: r.signal ?? null,
    name: r.name ?? r.company_name ?? null,
    sector: r.sector ?? r.sector_s33 ?? null,
    rs_topix_21d: r.rs_topix_21d ?? null,
    rs_sector_21d: r.rs_sector_21d ?? null,
    atr_ext_sma50: r.atr_ext_sma50 ?? null,
  }
}
