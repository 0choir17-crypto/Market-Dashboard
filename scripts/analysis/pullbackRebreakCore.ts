/**
 * 押し目深度 → 再ブレイク難易度の検証ロジック（純粋関数・DB非依存）
 *
 * 問い: 「高値からの押しが何％下落したら、その高値の再ブレイクが困難になるか」
 *
 * ── 測り方の設計 ─────────────────────────────────────────────────────────
 * 素朴に「エピソードの最終的な押し幅ごとに再ブレイク率を出す」と結果が歪む。
 * 浅い押しで終わったエピソードは「浅いうちに戻った成功例」に偏り、深いバケットは
 * 失敗例だけが残る（= 結果で条件付けたバイアス）。
 *
 * そこで本ロジックは **ハザード（生存）型** で測る:
 *
 *   閾値 d について、「押しが d に到達した」エピソードを母集団とし、
 *   **d に到達した日を起点に** H 営業日以内の再ブレイク率を出す。
 *
 * こうすると
 *   - 母集団が「その時点で d まで下げている銘柄」= 実際に判断を迫られる場面と一致する
 *   - 深い押しほど到達までに時間を食う分だけ観測期間が短くなる、という機械的な不利が消える
 * ので、d を横軸に並べた曲線がそのまま「難易度カーブ」になる。
 *
 * さらに P(次の閾値まで深くなる | d に到達) も出す。これは「10%まで来た押しが
 * 15%まで行く確率」で、いわゆる引き返せなくなる点を見るための指標。
 *
 * ── 打ち切り（censoring）─────────────────────────────────────────────────
 * d 到達から H 本ぶんのデータが無い（データ末尾 / エピソード打ち切り）ケースを
 * 「失敗」に数えると再ブレイク率が過小に出る。observed かどうかを判定し、
 * 未観測は分母から外して censored として別カウントする。
 */

// ── 入力 ───────────────────────────────────────────────────────────────────

export type Bar = {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

/** 高値/押し/再ブレイクを終値で測るか、高値-安値（日中値）で測るか。 */
export type PriceBasis = 'close' | 'hl'

export type AnalyzeParams = {
  /** 価格基準。close = 終値ベース（ノイズに強い・既定）、hl = 高値/安値ベース（押しが深く出る） */
  basis: PriceBasis
  /** 起点の高値は「直近 N 本の最高値」であること。ミクロな高値を弾くための足切り */
  peakLookback: number
  /** 高値から何% 下げたらエピソード（押し）開始と見なすか */
  triggerPct: number
  /**
   * 1 エピソードを追う最大営業日数（高値からの本数）。これを超えたら「再ブレイクせず」で打ち切る。
   * 注意: ホライズンは *閾値到達日* からの本数なので、maxEpisodeBars は
   * 「高値→閾値到達までの本数 + 最長ホライズン」より十分大きく取らないと、
   * 長いホライズンの列が丸ごと打ち切りになって使い物にならない。
   */
  maxEpisodeBars: number
  /** 高値時点の 20 日平均売買代金（億円）の下限。流動性フィルタ */
  minTurnoverOku: number
  /** 押し深度の閾値グリッド（%） */
  depthGridPct: number[]
  /** 押し深度の閾値グリッド（ADR 倍。ボラで正規化した深さ） */
  depthGridAdr: number[]
  /** 再ブレイク率を測る営業日ホライズン */
  horizons: number[]
  /** 再ブレイク後、この本数ぶん高値の上に留まれたら「確定」扱い */
  confirmBars: number
  /** これ未満の本数しか無い銘柄はスキップ */
  minBars: number
}

export const DEFAULT_PARAMS: AnalyzeParams = {
  basis: 'close',
  peakLookback: 60,
  triggerPct: 3,
  maxEpisodeBars: 500,
  minTurnoverOku: 1,
  depthGridPct: [3, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 40],
  depthGridAdr: [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12],
  horizons: [20, 40, 60, 120, 250],
  confirmBars: 5,
  minBars: 300,
}

// ── 出力 ───────────────────────────────────────────────────────────────────

export type Episode = {
  code: string
  peakDate: string
  peakPrice: number
  /** 押し開始（トリガー到達）日 */
  startDate: string
  /** 再ブレイクした日。null = 期間内に戻せず */
  rebreakDate: string | null
  /** 高値から再ブレイクまでの営業日数 */
  rebreakBars: number | null
  /** 再ブレイク後 confirmBars 本 高値の上に留まったか。null = 判定に足る本数が無い */
  confirmed: boolean | null
  /** エピソード中の最大押し幅(%) */
  maxDepthPct: number
  /** 同じく ADR 倍 */
  maxDepthAdr: number | null
  /** 高値時点の ADR(%) */
  adrPct: number | null
  /** 高値時点で 150 日線の上 かつ 150 日線が上向き */
  trend150: boolean | null
  /** 高値の 52 週高値からの距離(%)。0 = 新高値 */
  dist52wPct: number | null
  /** 高値時点の 20 日平均売買代金（億円） */
  turnoverOku: number | null
  /** 高値の年 */
  year: number

  // ── 集計用の内部インデックス（すべて銘柄内の bar index）──────────────
  peakIdx: number
  /** 観測を打ち切った bar index（再ブレイク日 / タイムアウト日 / データ末尾） */
  endIdx: number
  rebreakIdx: number | null
  /** 閾値(%) → 初到達 bar index */
  reachPct: Map<number, number>
  /** 閾値(ADR倍) → 初到達 bar index */
  reachAdr: Map<number, number>
}

export type HorizonStat = {
  horizon: number
  /** 観測できた母数（打ち切りを除く） */
  n: number
  hits: number
  rate: number | null
  censored: number
}

export type CurveRow = {
  threshold: number
  /** この深さまで到達したエピソード数 */
  nReached: number
  /** P(次の閾値まで深くなる | この閾値に到達)。最深行は null */
  pDeeper: number | null
  byHorizon: HorizonStat[]
  /** 再ブレイクしたエピソードの、閾値到達日 → 再ブレイクまでの営業日数の中央値 */
  medianBarsFromReach: number | null
  /** 再ブレイクしたうち confirmBars 本 上に留まれた割合 */
  confirmRate: number | null
  /** maxEpisodeBars 以内に一度でも再ブレイクした割合（打ち切り含むので参考値） */
  everRebreakRate: number | null
}

export type Curve = {
  axis: 'pct' | 'adr'
  label: string
  nEpisodes: number
  rows: CurveRow[]
}

// ── 小道具 ────────────────────────────────────────────────────────────────

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function sma(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (isNum(v)) {
      sum += v
      count++
    }
    if (i >= period) {
      const drop = values[i - period]
      if (isNum(drop)) {
        sum -= drop
        count--
      }
    }
    if (i >= period - 1 && count === period) out[i] = sum / period
  }
  return out
}

/** 直近 period 本（自分を含まない）の最大値。因果的（未来を見ない）。 */
function rollingMaxPrior(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - period)
    let max = -Infinity
    for (let j = from; j < i; j++) {
      const v = values[j]
      if (isNum(v) && v > max) max = v
    }
    out[i] = max === -Infinity ? null : max
  }
  return out
}

/** ADR(%) = 直近 period 本の (high/low - 1) の平均 × 100 */
function adrPctSeries(bars: Bar[], period: number): Array<number | null> {
  const ratios: Array<number | null> = bars.map((b) =>
    isNum(b.high) && isNum(b.low) && b.low > 0 ? (b.high / b.low - 1) * 100 : null,
  )
  return sma(ratios, period)
}

/** 直近 period 本の売買代金中央値（億円）。close×volume を代金とみなす。 */
function turnoverOkuSeries(bars: Bar[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null)
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) continue
    const window: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      const b = bars[j]
      if (isNum(b.close) && isNum(b.volume)) window.push((b.close * b.volume) / 1e8)
    }
    if (window.length === period) out[i] = median(window)
  }
  return out
}

// ── エピソード抽出 ─────────────────────────────────────────────────────────

/**
 * 1 銘柄の日足からエピソード（高値 → 押し → 再ブレイク or 失敗）を切り出す。
 *
 * 状態機械:
 *   seek     : 走行高値を更新し続ける。高値から triggerPct 下げたら pullback へ
 *   pullback : 押し幅を追う。走行高値を上抜けたら成功で確定、maxEpisodeBars 超で失敗
 *
 * 分割・併合などで価格が飛んだ足（前日比 ±50% 超）はデータ断絶とみなし、状態を
 * リセットする（未調整データを掴んだときに偽の暴落エピソードを量産しないため）。
 */
export function buildEpisodes(code: string, bars: Bar[], params: AnalyzeParams): Episode[] {
  const p = params
  const n = bars.length
  const episodes: Episode[] = []
  if (n < p.minBars) return episodes

  const closes = bars.map((b) => b.close)
  // 高値側 / 安値側 / 再ブレイク判定に使う価格系列を basis で切り替える。
  const peakSrc: Array<number | null> = p.basis === 'hl' ? bars.map((b) => b.high) : closes
  const troughSrc: Array<number | null> = p.basis === 'hl' ? bars.map((b) => b.low) : closes
  const breakSrc: Array<number | null> = p.basis === 'hl' ? bars.map((b) => b.high) : closes

  const priorMax = rollingMaxPrior(peakSrc, p.peakLookback)
  const adr = adrPctSeries(bars, 20)
  const sma150 = sma(closes, 150)
  const max250 = rollingMaxPrior(closes, 250)
  const turnover = turnoverOkuSeries(bars, 20)

  const warmup = Math.max(p.peakLookback, 150, 20)

  type Live = {
    peakIdx: number
    peakVal: number
    trough: number
    reachPct: Map<number, number>
    reachAdr: Map<number, number>
    adrAtPeak: number | null
  }

  let live: Live | null = null
  let peakIdx = warmup
  let peakVal = peakSrc[warmup] ?? -Infinity

  const resetSeek = (i: number) => {
    live = null
    peakIdx = i
    peakVal = peakSrc[i] ?? -Infinity
  }

  /** 起点の高値として認めるか（直近 N 本の最高値 かつ 流動性クリア）。 */
  const qualifiedPeak = (idx: number): boolean => {
    if (idx < warmup) return false
    const pm = priorMax[idx]
    const pv = peakSrc[idx]
    if (!isNum(pv)) return false
    if (isNum(pm) && pv < pm) return false
    const to = turnover[idx]
    if (p.minTurnoverOku > 0 && (!isNum(to) || to < p.minTurnoverOku)) return false
    return true
  }

  const finish = (l: Live, endIdx: number, rebreakIdx: number | null) => {
    const maxDepthPct = (1 - l.trough / l.peakVal) * 100
    const adrAtPeak = l.adrAtPeak
    const s150 = sma150[l.peakIdx]
    const s150Prev = l.peakIdx >= 20 ? sma150[l.peakIdx - 20] : null
    const m250 = max250[l.peakIdx]

    let confirmed: boolean | null = null
    if (rebreakIdx !== null) {
      const last = rebreakIdx + p.confirmBars
      if (last < n) {
        confirmed = true
        for (let j = rebreakIdx + 1; j <= last; j++) {
          const c = closes[j]
          if (!isNum(c) || c < l.peakVal) {
            confirmed = false
            break
          }
        }
      }
    }

    episodes.push({
      code,
      peakDate: bars[l.peakIdx].date,
      peakPrice: l.peakVal,
      startDate: bars[Math.min(endIdx, l.peakIdx + 1)].date,
      rebreakDate: rebreakIdx !== null ? bars[rebreakIdx].date : null,
      rebreakBars: rebreakIdx !== null ? rebreakIdx - l.peakIdx : null,
      confirmed,
      maxDepthPct,
      maxDepthAdr: isNum(adrAtPeak) && adrAtPeak > 0 ? maxDepthPct / adrAtPeak : null,
      adrPct: adrAtPeak,
      trend150:
        isNum(closes[l.peakIdx]) && isNum(s150) && isNum(s150Prev)
          ? closes[l.peakIdx]! > s150 && s150 > s150Prev
          : null,
      dist52wPct: isNum(m250) && m250 > 0 ? (l.peakVal / Math.max(m250, l.peakVal) - 1) * 100 : null,
      turnoverOku: turnover[l.peakIdx] ?? null,
      year: Number(bars[l.peakIdx].date.slice(0, 4)),
      peakIdx: l.peakIdx,
      endIdx,
      rebreakIdx,
      reachPct: l.reachPct,
      reachAdr: l.reachAdr,
    })
  }

  for (let i = warmup + 1; i < n; i++) {
    const c = closes[i]
    const cPrev = closes[i - 1]
    // データ断絶ガード（未調整の分割・併合など）
    if (!isNum(c) || !isNum(cPrev) || cPrev <= 0 || Math.abs(c / cPrev - 1) > 0.5) {
      resetSeek(i)
      continue
    }

    if (live === null) {
      const pv = peakSrc[i]
      if (isNum(pv) && pv >= peakVal) {
        peakVal = pv
        peakIdx = i
        continue
      }
      const tv = troughSrc[i]
      if (!isNum(tv) || peakVal <= 0) continue
      const dd = (1 - tv / peakVal) * 100
      if (dd < p.triggerPct) continue

      // 押しが始まった。起点の高値が「本物の高値」でなければこの山は捨てて再探索。
      if (!qualifiedPeak(peakIdx)) {
        resetSeek(i)
        continue
      }
      live = {
        peakIdx,
        peakVal,
        trough: tv,
        reachPct: new Map(),
        reachAdr: new Map(),
        adrAtPeak: adr[peakIdx] ?? null,
      }
    } else {
      const tv = troughSrc[i]
      if (isNum(tv) && tv < live.trough) live.trough = tv
    }

    const l: Live = live
    const depth = (1 - l.trough / l.peakVal) * 100
    for (const d of p.depthGridPct) {
      if (depth >= d && !l.reachPct.has(d)) l.reachPct.set(d, i)
    }
    if (isNum(l.adrAtPeak) && l.adrAtPeak > 0) {
      const depthAdr = depth / l.adrAtPeak
      for (const d of p.depthGridAdr) {
        if (depthAdr >= d && !l.reachAdr.has(d)) l.reachAdr.set(d, i)
      }
    }

    // 再ブレイク判定は「押しに入った翌足以降」。同じ足で往復した場合は成功にしない。
    const bv = breakSrc[i]
    if (isNum(bv) && bv >= l.peakVal && i > l.peakIdx) {
      finish(l, i, i)
      resetSeek(i)
      continue
    }
    if (i - l.peakIdx >= p.maxEpisodeBars) {
      finish(l, i, null)
      resetSeek(i)
    }
  }

  // データ末尾で未決着のエピソードも残す（打ち切り扱いで集計側が処理する）
  if (live !== null) finish(live, n - 1, null)

  return episodes
}

// ── 集計（ハザード型の難易度カーブ）────────────────────────────────────────

function buildRow(
  threshold: number,
  nextThreshold: number | null,
  reachOf: (e: Episode) => Map<number, number>,
  episodes: Episode[],
  params: AnalyzeParams,
): CurveRow {
  const reached: Array<{ ep: Episode; reachIdx: number }> = []
  for (const ep of episodes) {
    const idx = reachOf(ep).get(threshold)
    if (idx !== undefined) reached.push({ ep, reachIdx: idx })
  }

  const nReached = reached.length
  let deeper = 0
  const barsFromReach: number[] = []
  let rebrokeEver = 0
  let confirmedCount = 0
  let confirmKnown = 0

  const horizonAcc = params.horizons.map((h) => ({ horizon: h, n: 0, hits: 0, censored: 0 }))

  for (const { ep, reachIdx } of reached) {
    if (nextThreshold !== null && reachOf(ep).has(nextThreshold)) deeper++

    const rb = ep.rebreakIdx
    if (rb !== null) {
      rebrokeEver++
      barsFromReach.push(rb - reachIdx)
      if (ep.confirmed !== null) {
        confirmKnown++
        if (ep.confirmed) confirmedCount++
      }
    }

    for (const acc of horizonAcc) {
      const deadline = reachIdx + acc.horizon
      if (rb !== null && rb <= deadline) {
        acc.n++
        acc.hits++
      } else if (ep.endIdx >= deadline) {
        // 期限まで観測できて、再ブレイクしなかった（または期限後に戻した）
        acc.n++
      } else {
        // 期限までのデータが無い = 打ち切り。分母から外す
        acc.censored++
      }
    }
  }

  return {
    threshold,
    nReached,
    pDeeper: nextThreshold !== null && nReached > 0 ? deeper / nReached : null,
    byHorizon: horizonAcc.map((a) => ({
      horizon: a.horizon,
      n: a.n,
      hits: a.hits,
      rate: a.n > 0 ? a.hits / a.n : null,
      censored: a.censored,
    })),
    medianBarsFromReach: median(barsFromReach),
    confirmRate: confirmKnown > 0 ? confirmedCount / confirmKnown : null,
    everRebreakRate: nReached > 0 ? rebrokeEver / nReached : null,
  }
}

export function buildCurve(
  axis: 'pct' | 'adr',
  label: string,
  episodes: Episode[],
  params: AnalyzeParams,
): Curve {
  const grid = axis === 'pct' ? params.depthGridPct : params.depthGridAdr
  const reachOf = (e: Episode) => (axis === 'pct' ? e.reachPct : e.reachAdr)
  const pool = axis === 'adr' ? episodes.filter((e) => e.maxDepthAdr !== null) : episodes
  const rows = grid.map((d, i) => buildRow(d, i + 1 < grid.length ? grid[i + 1] : null, reachOf, pool, params))
  return { axis, label, nEpisodes: pool.length, rows }
}

// ── セグメント分割 ─────────────────────────────────────────────────────────

export type SegmentKey = 'adr' | 'trend' | 'dist52w' | 'year'

export function segmentLabel(key: SegmentKey, ep: Episode): string | null {
  switch (key) {
    case 'adr': {
      const a = ep.adrPct
      if (!isNum(a)) return null
      if (a < 3) return 'ADR <3%'
      if (a < 5) return 'ADR 3-5%'
      if (a < 8) return 'ADR 5-8%'
      return 'ADR >=8%'
    }
    case 'trend': {
      if (ep.trend150 === null) return null
      return ep.trend150 ? '150日線 上向き・上' : 'それ以外'
    }
    case 'dist52w': {
      const d = ep.dist52wPct
      if (!isNum(d)) return null
      if (d >= -2) return '52週高値圏 (>=-2%)'
      if (d >= -10) return '高値から -2〜-10%'
      return '高値から -10% 超'
    }
    case 'year':
      return String(ep.year)
  }
}

export function groupBy(episodes: Episode[], key: SegmentKey): Map<string, Episode[]> {
  const out = new Map<string, Episode[]>()
  for (const ep of episodes) {
    const label = segmentLabel(key, ep)
    if (label === null) continue
    const arr = out.get(label)
    if (arr) arr.push(ep)
    else out.set(label, [ep])
  }
  return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

// ── 結論の抽出 ─────────────────────────────────────────────────────────────

export type Knee = {
  horizon: number
  /** 再ブレイク率が 50% を初めて割る閾値 */
  halfLife: number | null
  /** 隣接閾値間で再ブレイク率の落ち込みが最大だった区間 */
  steepest: { from: number; to: number; drop: number } | null
}

/**
 * 難易度カーブの「折れ点」を拾う。
 *   halfLife : 再ブレイク率が 5 割を割る深さ = ここから先は分の悪い賭けになる
 *   steepest : 1 段深くなるごとの劣化が最も大きい区間 = 実質的な分水嶺
 * 標本の薄い行（minN 未満）はノイズなので候補から外す。
 */
export function findKnee(curve: Curve, horizon: number, minN = 30): Knee {
  const pts = curve.rows
    .map((r) => {
      const h = r.byHorizon.find((x) => x.horizon === horizon)
      return h && h.rate !== null && h.n >= minN ? { threshold: r.threshold, rate: h.rate } : null
    })
    .filter((x): x is { threshold: number; rate: number } => x !== null)

  let halfLife: number | null = null
  for (const p of pts) {
    if (p.rate < 0.5) {
      halfLife = p.threshold
      break
    }
  }

  let steepest: Knee['steepest'] = null
  for (let i = 1; i < pts.length; i++) {
    const drop = pts[i - 1].rate - pts[i].rate
    if (!steepest || drop > steepest.drop) {
      steepest = { from: pts[i - 1].threshold, to: pts[i].threshold, drop }
    }
  }

  return { horizon, halfLife, steepest }
}
