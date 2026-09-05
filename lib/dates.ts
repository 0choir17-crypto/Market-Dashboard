// JST (Asia/Tokyo) date helpers.
//
// `new Date().toISOString().slice(0, 10)` returns the UTC calendar day, which
// is *yesterday* for a JST user between 00:00 and 08:59. Every default date in
// trade-entry forms must therefore go through todayJST() instead.

/** Today's date in JST as 'YYYY-MM-DD'. */
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * timestamptz を JST の時刻表示に変換する。
 *
 * Supabase は timestamptz を UTC (`2026-09-05T02:20:40+00:00`) で返すが、
 * 記録は JST 基準（夜 18〜23 時に集中）なので、そのまま出すと
 * 「夜の作業」が昼前の時刻に見えてしまう。
 */
export function formatJstTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** timestamptz を JST の日時表示に変換する（M/D HH:MM）。 */
export function formatJstDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
