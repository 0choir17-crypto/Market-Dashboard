// JST (Asia/Tokyo) date helpers.
//
// `new Date().toISOString().slice(0, 10)` returns the UTC calendar day, which
// is *yesterday* for a JST user between 00:00 and 08:59. Every default date in
// trade-entry forms must therefore go through todayJST() instead.

/** Today's date in JST as 'YYYY-MM-DD'. */
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
