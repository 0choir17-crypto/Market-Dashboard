/**
 * 難易度カーブの表示 / 書き出し（DB非依存）
 * CLI (pullbackRebreak.ts) とセルフテストの両方から使う。
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findKnee, type AnalyzeParams, type Curve, type Episode } from './pullbackRebreakCore'

// 日本語ラベルは端末上で 2 セル幅なので、String.length で桁揃えすると列がずれる。
// 全角レンジを 2 幅として数える。表内の記号は幅が曖昧な ≥ / → / — を避け ASCII に統一する。
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/

function dispWidth(s: string): number {
  let w = 0
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1
  return w
}

function pad(s: string, w: number, right = true): string {
  const fill = ' '.repeat(Math.max(0, w - dispWidth(s)))
  return right ? fill + s : s + fill
}

const pct = (v: number | null, digits = 1) => (v === null ? '-' : `${(v * 100).toFixed(digits)}%`)

/** 標本がこれ未満の行は数字に "?" を付ける（偶然に振り回されやすい） */
const THIN_N = 30

export function formatCurve(curve: Curve, params: AnalyzeParams): string {
  const unit = curve.axis === 'pct' ? '%' : '×ADR'
  const maxH = Math.max(...params.horizons)
  const out: string[] = []
  const head = [
    pad('押し>=', 9, false),
    pad('n', 6),
    pad('深化', 6),
    ...params.horizons.map((h) => pad(`<=${h}d`, 8)),
    pad('中央日数', 9),
    pad('確定率', 7),
    pad(`打切@${maxH}d`, 11),
  ].join(' ')

  out.push(
    `\n-- ${curve.label}  [深度軸: ${curve.axis === 'pct' ? '%' : 'ADR倍'}]  エピソード ${curve.nEpisodes} 件`,
  )
  out.push(head)
  out.push('-'.repeat(dispWidth(head)))

  for (const r of curve.rows) {
    const last = r.byHorizon.find((h) => h.horizon === maxH)
    const censShare = last && last.n + last.censored > 0 ? last.censored / (last.n + last.censored) : null
    out.push(
      [
        pad(`${r.threshold}${unit}`, 9, false),
        pad(String(r.nReached), 6),
        pad(r.pDeeper === null ? '-' : pct(r.pDeeper, 0), 6),
        ...r.byHorizon.map((h) => pad(h.n === 0 ? '-' : `${pct(h.rate, 0)}${h.n < THIN_N ? '?' : ''}`, 8)),
        pad(r.medianBarsFromReach === null ? '-' : String(r.medianBarsFromReach), 9),
        pad(pct(r.confirmRate, 0), 7),
        pad(censShare === null ? '-' : pct(censShare, 0), 11),
      ].join(' '),
    )
  }
  return out.join('\n')
}

export function formatKnee(curve: Curve, horizon: number): string {
  const k = findKnee(curve, horizon)
  const unit = curve.axis === 'pct' ? '%' : '×ADR'
  const lines = [
    k.halfLife === null
      ? `  >> ${horizon}営業日以内の再ブレイク率が 50% を割る深さは、観測レンジ内には無し`
      : `  >> ${horizon}営業日以内の再ブレイク率が 50% を割るのは 押し ${k.halfLife}${unit} から`,
  ]
  if (k.steepest) {
    lines.push(
      `    最も劣化が急な区間: ${k.steepest.from}${unit} → ${k.steepest.to}${unit}（${(k.steepest.drop * 100).toFixed(1)}pt 低下）`,
    )
  }
  return lines.join('\n')
}

export function legend(params: AnalyzeParams): string {
  return (
    `列の意味:\n` +
    `  n        その深さまで下げたエピソード数（累積・「押し >= その値」の母集団）\n` +
    `  深化     そこから 1 段深い閾値まで下げてしまった割合。引き返せなくなる点の目安\n` +
    `  <=Nd     **その深さに到達した日** から N 営業日以内に高値を再ブレイクした割合\n` +
    `  中央日数  到達日から再ブレイクまでの営業日数の中央値（戻せた例のみ）\n` +
    `  確定率    再ブレイク後 ${params.confirmBars} 営業日、終値が高値の上に留まれた割合（ダマシでない割合）\n` +
    `  打切      最長ホライズンぶんのデータが無く判定不能だった割合。高い列の数字は割り引いて読む\n` +
    `  数字の "?" は母数 ${THIN_N} 件未満`
  )
}

export function writeOutputs(dir: string, params: AnalyzeParams, episodes: Episode[], curves: Curve[]) {
  mkdirSync(dir, { recursive: true })
  const header = [
    'code',
    'peak_date',
    'peak_price',
    'rebreak_date',
    'rebreak_bars',
    'confirmed',
    'max_depth_pct',
    'max_depth_adr',
    'adr_pct',
    'trend150',
    'dist52w_pct',
    'turnover_oku',
  ]
  const lines = [header.join(',')]
  for (const e of episodes) {
    lines.push(
      [
        e.code,
        e.peakDate,
        e.peakPrice,
        e.rebreakDate ?? '',
        e.rebreakBars ?? '',
        e.confirmed === null ? '' : e.confirmed ? 1 : 0,
        e.maxDepthPct.toFixed(2),
        e.maxDepthAdr === null ? '' : e.maxDepthAdr.toFixed(2),
        e.adrPct === null ? '' : e.adrPct.toFixed(2),
        e.trend150 === null ? '' : e.trend150 ? 1 : 0,
        e.dist52wPct === null ? '' : e.dist52wPct.toFixed(2),
        e.turnoverOku === null ? '' : e.turnoverOku.toFixed(2),
      ].join(','),
    )
  }
  writeFileSync(join(dir, 'episodes.csv'), lines.join('\n'), 'utf-8')
  writeFileSync(join(dir, 'curves.json'), JSON.stringify({ params, curves }, null, 2), 'utf-8')
  return { csv: join(dir, 'episodes.csv'), json: join(dir, 'curves.json') }
}
