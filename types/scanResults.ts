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
