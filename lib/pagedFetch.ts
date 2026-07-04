// Supabase caps every response at 1000 rows (PostgREST db-max-rows), even
// when a larger .limit() is requested. Any query that can grow past that —
// price history, sector time series, a whole journal — silently truncates
// unless it pages with .range(). This helper centralizes the paging loop that
// lib/marketLeadersFetch.ts#fetchHistory pioneered.
//
// The query builder passed in MUST apply a stable total ordering (e.g.
// .order('date').order('code')) so pages don't overlap or skip rows.

const PAGE_SIZE = 1000

type PageResult<Row> = { data: Row[] | null; error: { message: string } | null }

/**
 * Fetch all rows of a query by paging through Supabase's 1000-row cap.
 *
 * @param buildQuery Called once per page with the [from, to] range; must
 *   return the query with a stable ordering applied. Rebuilding the query per
 *   page is required because PostgREST builders are single-use.
 * @param maxRows Safety valve — stop after this many rows (default 50k).
 */
export async function fetchAllPaged<Row>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  maxRows = 50_000,
): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = []
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) return { rows, error: error.message }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return { rows, error: null }
}
