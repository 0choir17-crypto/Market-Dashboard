'use client'

import { useState } from 'react'

// ── Screen Guide Data (Phase 2.1, 2026-05-05) ───────────────────────────────
// 採用 2 screens (本リポ commit a47852a): DIV_DY_Incr_EpsGr + FCT_ValueQuality_CRS
// 旧 11 screens は Phase 2.1 で archive (legacy 表示のみ).
type ScreenGuideEntry = {
  rank: number
  name: string
  dbName: string
  type: 'always_on' | 'bull' | 'bear'
  kind: 'factor' | 'event'
  holdDays: number
  mcCondition: string
  conditions: string
  role: string
  backtest: {
    oos_pf: number
    oos_wr: number
    oos_n?: number
    spd: number
    wf: string
    regime_note: string
  }
}

const SCREEN_GUIDE_V4: ScreenGuideEntry[] = [
  {
    rank: 1,
    name: 'Div Bear',
    dbName: 'DIV_DY_Incr_EpsGr',
    type: 'bear',
    kind: 'factor',
    holdDays: 20,
    mcCondition: 'mc_v4 ∈ [very_bear, bear, neutral]',
    conditions: '配当利回り≥2% & 増配 (dividend_increase≥1) & EPS YoY≥30%',
    role:
      'Bear / Neutral 環境でディフェンシブな増配・配当利回りグロース銘柄を検出。' +
      'Phase 2.0 regime pool scan で全 5 regime 候補入り、PF_med=4.28 / WF=5/5 で本番採用。',
    backtest: {
      oos_pf: 4.46,
      oos_wr: 69.1,
      oos_n: 8211,
      spd: 6.7,
      wf: '5/5',
      regime_note: 'Phase 2.1 採用. mc_v4 ∈ [very_bear, bear, neutral] で発動.',
    },
  },
  {
    rank: 2,
    name: 'Value',
    dbName: 'FCT_ValueQuality_CRS',
    type: 'bear',
    kind: 'factor',
    holdDays: 40,
    mcCondition: 'mc_v4 ∈ [very_bear, bear]',
    conditions: 'PBR≤0.5 & EPS≥100 & ADR≤3% & cockpit_rs≥80',
    role:
      'Bear 環境で低 PBR×高 EPS×高 RS のバリュー×クオリティ複合銘柄を検出。' +
      'Phase 2.0 regime pool scan で very_bear/bear 採用基準達, PF_med=2.38.',
    backtest: {
      oos_pf: 4.20,
      oos_wr: 67.5,
      oos_n: 17817,
      spd: 14.4,
      wf: '4/5',
      regime_note:
        'Phase 2.1 採用 (mc_v3 旧設定 MC≥20 → mc_v4 ∈ [very_bear, bear] に再分類).',
    },
  },
  // 旧 11 screens は Phase 2.1 で archive. lib/screenNames.ts LEGACY_SCREEN_NAMES
  // に display name のみ残置, 詳細定義は本リポ git history (commit a47852a 以前) と
  // 21-Cloudl-Database scripts/archive/screens_archived_20260503.json を参照.
]

// ── Sort logic ────────────────────────────────────────────────────────────────
type SortKey = 'rank' | 'name' | 'type' | 'kind' | 'holdDays' | 'oos_pf' | 'oos_wr' | 'spd'
type SortDir = 'asc' | 'desc'

// ── Type / Kind badge colors ─────────────────────────────────────────────────
const TYPE_BADGE: Record<string, string> = {
  always_on: 'bg-blue-100 text-blue-700 border-blue-300',
  bull:      'bg-green-100 text-green-700 border-green-300',
  bear:      'bg-red-100 text-red-700 border-red-300',
}

const KIND_BADGE: Record<string, string> = {
  factor: 'bg-purple-100 text-purple-700 border-purple-300',
  event:  'bg-orange-100 text-orange-700 border-orange-300',
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '\u2014'
  return v.toFixed(2)
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '\u2014'
  return v.toFixed(1) + '%'
}

// ── Glossary data ────────────────────────────────────────────────────────────
const GLOSSARY = [
  { term: 'RS',       desc: 'Cockpit RS\u3002\u500b\u5225\u9298\u67c4\u306eClose\u00f7TOPIX\u6bd4\u7387\u3092\u3001\u904e\u53bb\u306e\u81ea\u5206\u81ea\u8eab\u3068\u6bd4\u8f03\u3057\u305f\u30d1\u30fc\u30bb\u30f3\u30bf\u30a4\u30eb\uff080\u301c100\uff09\u300280\u4ee5\u4e0a=TOPIX\u306b\u5bfe\u3057\u3066\u76f4\u8fd1\u3067\u304b\u306a\u308a\u5f37\u3044' },
  { term: 'R (ATR\u5358\u4f4d)', desc: '\u8ddd\u96e2\u3092ATR\uff0814\u65e5\u5e73\u5747\u771f\u306e\u30ec\u30f3\u30b8\uff09\u3067\u5272\u3063\u305f\u5024\u3002-1.5R = ATR\u306e1.5\u500d\u5206\u3060\u3051\u4e0b\u843d\u3057\u3066\u3044\u308b' },
  { term: 'VCS',      desc: 'Volatility Contraction Score\u3002\u30dc\u30e9\u30c6\u30a3\u30ea\u30c6\u30a3\u306e\u53ce\u7e2e\u5ea6\u5408\u30920-100\u3067\u30b9\u30b3\u30a2\u5316\u300280\u4ee5\u4e0a=\u304b\u306a\u308a\u30bf\u30a4\u30c8\u306b\u53ce\u7e2e' },
  { term: 'ADR%',     desc: 'Average Daily Range\u3002\u904e\u53bb21\u65e5\u306e\u5e73\u5747\u65e5\u4e2d\u5024\u5e45(%)\u3002\u4f4e\u3044\u307b\u3069\u4f4e\u30dc\u30e9' },
  { term: 'PF',       desc: 'Profit Factor\u3002\u7dcf\u5229\u76ca\u00f7\u7dcf\u640d\u5931\u30001.0\u4ee5\u4e0a\u3067\u671f\u5f85\u5024\u30d7\u30e9\u30b9' },
  { term: 'WF',       desc: 'Walk-Forward\u3002\u6642\u7cfb\u52175\u5206\u5272\u3067\u5404\u671f\u9593\u306eOOS\u6210\u7e3e\u3092\u691c\u8a3c\u30005/5=\u5168\u671f\u9593\u3067PF>1.0' },
  { term: 'SPD',      desc: 'Signals Per Day\u30001\u65e5\u3042\u305f\u308a\u306e\u5e73\u5747\u30b7\u30b0\u30ca\u30eb\u6570' },
  { term: 'Hit',      desc: '1\u9298\u67c4\u304c\u8907\u6570\u30b9\u30af\u30ea\u30fc\u30f3\u306b\u540c\u6642\u30d2\u30c3\u30c8\u3057\u305f\u56de\u6570\u3002\u591a\u3044\u307b\u3069\u78ba\u4fe1\u5ea6\u304c\u9ad8\u3044' },
  { term: 'Factor',   desc: '\u6bce\u65e5\u5168\u9298\u67c4\u3092\u30b9\u30ad\u30e3\u30f3\u3059\u308b\u30bf\u30a4\u30d7\u3002\u6761\u4ef6\u3092\u6e80\u305f\u3059\u9650\u308a\u6bce\u65e5\u30b7\u30b0\u30ca\u30eb\u304c\u51fa\u308b' },
  { term: 'Event',    desc: '\u7279\u5b9a\u306e\u30a4\u30d9\u30f3\u30c8\uff08\u30ae\u30e3\u30c3\u30d7\u30a2\u30c3\u30d7\u3001\u30d6\u30ec\u30a4\u30af\u30a2\u30a6\u30c8\u7b49\uff09\u304c\u767a\u751f\u3057\u305f\u65e5\u306e\u307f\u30b7\u30b0\u30ca\u30eb\u304c\u51fa\u308b' },
  { term: 'MC',    desc: 'Market Condition v3\u300221\u8981\u7d20\u306e\u30b9\u30b3\u30a2\u30ab\u30fc\u30c9\u3067\u5e02\u5834\u74b0\u5883\u30920\u301c21\u70b9\u3067\u8a55\u4fa1\u3002\u9ad8\u3044=\u5f37\u6c17\u3001\u4f4e\u3044=\u5f31\u6c17' },
  { term: 'DuPont Leverage', desc: '\u7dcf\u8cc7\u7523\u00f7\u81ea\u5df1\u8cc7\u672c\u3002\u8ca1\u52d9\u30ec\u30d0\u30ec\u30c3\u30b8\u306e\u6307\u6a19\u30022.0\u4ee5\u4e0a\u306f\u904e\u5270\u50b5\u52d9\u30ea\u30b9\u30af\u3068\u3057\u3066\u30d5\u30a3\u30eb\u30bf\u30fc' },
  { term: 'Divergence', desc: '\u6307\u6570\u304c\u4e0a\u6607\u3057\u3066\u3044\u308b\u306e\u306bBreadth\u304c\u60aa\u5316\u3057\u3066\u3044\u308b\u72b6\u614b\u3002\u5929\u4e95\u306e\u8b66\u544a\u30b7\u30b0\u30ca\u30eb' },
  { term: 'Velocity',   desc: 'MC v4 \u30b9\u30b3\u30a2\u306e\u5909\u5316\u901f\u5ea6\u30021d / 5d / 10d \u306e\u5dee\u5206\u3068 20d \u6a19\u6e96\u504f\u5dee\u3067\u300c\u3069\u3046\u52d5\u3044\u3066\u3044\u308b\u304b\u300d\u3092\u6e2c\u308b' },
  { term: 'Duration',   desc: '\u73fe\u30ec\u30b8\u30fc\u30e0\u306e\u7d99\u7d9a\u671f\u9593\u3002run_length = \u9023\u7d9a\u6ede\u5728\u65e5\u6570\u3001shift_event = 1 \u306f\u5f53\u65e5\u8ee2\u63db' },
  { term: 'Shock',      desc: '\u6025\u5909\u52d5\u691c\u77e5\u30d5\u30e9\u30b0\u3002Panic = \u6025\u843d\u30fb\u6025\u4e0b\u9650\u3001Relief = \u6025\u56de\u5fa9\u3002\u3044\u305a\u308c\u3082 OFF \u3067 Calm' },
  { term: 'Regime Run Length', desc: '\u73fe\u5728\u306e MC v4 regime (strong_bull / bull / neutral / bear / strong_bear) \u306b\u9023\u7d9a\u3067\u6ede\u5728\u3057\u3066\u3044\u308b\u55b6\u696d\u65e5\u6570' },
]

// ── Sortable header ───────────────────────────────────────────────────────────
function GuideSortTh({
  label,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = currentKey === key
  const indicator = active ? (currentDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195'
  return (
    <th
      onClick={() => onSort(key)}
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-[var(--accent)]' : 'text-gray-500'}`}
    >
      {label}<span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

// ── Main Guide Page ───────────────────────────────────────────────────────────
export default function GuidePage() {
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'rank' ? 'asc' : 'desc')
    }
  }

  function sortEntries(entries: ScreenGuideEntry[]): ScreenGuideEntry[] {
    return [...entries].sort((a, b) => {
      const getVal = (e: ScreenGuideEntry): string | number => {
        switch (sortKey) {
          case 'rank':     return e.rank
          case 'name':     return e.name
          case 'type':     return e.type
          case 'kind':     return e.kind
          case 'holdDays': return e.holdDays
          case 'oos_pf':   return e.backtest.oos_pf ?? -Infinity
          case 'oos_wr':   return e.backtest.oos_wr ?? -Infinity
          case 'spd':      return e.backtest.spd ?? -Infinity
          default:         return e.rank
        }
      }
      const av = getVal(a)
      const bv = getVal(b)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      if (av === bv) return 0
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
  }

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }
  const sorted = sortEntries(SCREEN_GUIDE_V4)

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
        >
          Screen Guide
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          screens_v5 + MC — Always-on 4 + Bear 4 + Bull 3（11 screens）
        </p>
      </header>

      {/* ── Screen Table ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Screens
        </h2>
        <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e8eaed]">
                <GuideSortTh label="#"         sortKey="rank"     {...sp} />
                <GuideSortTh label="Screen"    sortKey="name"     {...sp} />
                <GuideSortTh label="Type"      sortKey="type"     {...sp} />
                <GuideSortTh label="Kind"      sortKey="kind"     {...sp} />
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">MC</th>
                <GuideSortTh label="Hold"      sortKey="holdDays" {...sp} align="right" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Conditions</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Role</th>
                <GuideSortTh label="OOS PF"    sortKey="oos_pf"   {...sp} align="right" />
                <GuideSortTh label="OOS WR"    sortKey="oos_wr"   {...sp} align="right" />
                <GuideSortTh label="SPD"       sortKey="spd"      {...sp} align="right" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">WF</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr
                  key={s.dbName}
                  className={`border-b border-[#f0f2f4] hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500 text-center">{s.rank}</td>
                  <td className="px-3 py-2.5 font-bold text-sm whitespace-nowrap">{s.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${TYPE_BADGE[s.type]}`}>
                      {s.type === 'always_on' ? 'Always' : s.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${KIND_BADGE[s.kind]}`}>
                      {s.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      s.type === 'always_on'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : s.type === 'bear'
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-green-50 text-green-600 border-green-200'
                    }`}>
                      {s.mcCondition}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{s.holdDays}d</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[220px]">{s.conditions}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[260px]">{s.role}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold">{fmtNum(s.backtest.oos_pf)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold">{fmtPct(s.backtest.oos_wr)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{s.backtest.spd.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-600 whitespace-nowrap">{s.backtest.wf || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Market Condition ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Market Condition (MC)
        </h2>
        <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
          <p className="text-sm text-gray-600 mb-3">
            画面上部のバッジはマーケット全体の状態を示します。MC v4 は 8 ファクター加重平均で市場環境を 0〜100 点で評価します
            （v4 未集計の古い日付は v3 にフォールバック）。
          </p>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><strong className="text-gray-900">Trend</strong> — TOPIXの位置関係（Bull / Neutral / Bear）</li>
            <li><strong className="text-gray-900">Scorecard</strong> — MC v4 スコア（0-100）。レジーム境界 80 / 60 / 40 / 20 で strong_bull / bull / neutral / bear / strong_bear</li>
            <li><strong className="text-gray-900">Breadth</strong> — 値上がり銘柄比率の強度（Strong / Normal / Weak）</li>
            <li><strong className="text-gray-900">Divergence</strong> — 指数↑ × Breadth↓ の天井警告フラグ（v4 では現状無効化中。効果検証で統計的有意性なしのため）</li>
          </ul>
          <div className="mt-4 rounded-lg bg-gray-50 border border-[#e8eaed] p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Screen Activation Category</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li><span className="inline-block w-16 font-semibold text-blue-600">Always-on</span>MC スコアに関係なく常に発動（4本）</li>
              <li><span className="inline-block w-16 font-semibold text-red-600">Bear</span>MC スコアが閾値以下で発動 — 下落相場で有効（3本）</li>
              <li><span className="inline-block w-16 font-semibold text-green-600">Bull</span>MC スコアが閾値以上で発動 — 上昇相場で有効（3本）</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              ※ Screen 判定は Shadow Mode のため現状 v3 (0-21) ベース。v4 観察期間後に v4 ベースで再最適化予定。
            </p>
          </div>
        </div>
      </section>

      {/* ── MC v4 — 8 Factors ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          8 Factors (v4) — 各ファクターの中身
        </h2>
        <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
          <p className="text-sm text-gray-600 mb-4">
            FactorGrid に表示される 8 ファクターは TOPIX / 日経225 / グロース250 の 3 指数と全銘柄ブレッド・需給データを源に計算され、
            それぞれ過去 252 営業日の自分の分布に対する <strong className="text-gray-900">パーセンタイルランク (0-100)</strong> として表示されます。
            数値が高いほど「過去 1 年で見て上位」を意味します。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-[#e8eaed]">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">ID</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">名称</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">重み</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">何を測っているか</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">入力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eaed]">
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-emerald-700">M1</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">短期モメンタム</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">20%</td>
                  <td className="px-3 py-2 text-gray-600">
                    直近 1 週間の指数リターンと値上がり銘柄比率を組み合わせた短期勢い
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    0.6 × avg(chg_1w) + 0.4 × (adv_pct−50)/10
                  </td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-emerald-700">M2</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">中期トレンド</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">10%</td>
                  <td className="px-3 py-2 text-gray-600">
                    3 指数のうち何本が SMA50 上にあるか + 全銘柄の SMA50 越え比率
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    above_count(0-3) + pct_above_sma50/100
                  </td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-emerald-700">M3</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">EMA21 真 slope</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">20%</td>
                  <td className="px-3 py-2 text-gray-600">
                    EMA21 自身の 5 日変化率を 3 指数で平均。トレンド転換を 1〜3 日早く検知
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    mean[3idx] of (EMA21_t − EMA21_t-5) / EMA21_t-5
                  </td>
                </tr>
                <tr className="bg-amber-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-amber-700">C1</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">長期確認統合</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">5%</td>
                  <td className="px-3 py-2 text-gray-600">
                    YTD・1 年リターン・52 週高値からの距離を統合した長期コンファーム
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    0.35 × YTD + 0.35 × 1Y + 0.30 × pct_52wh
                  </td>
                </tr>
                <tr className="bg-blue-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-blue-700">B1</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">ブレッド独立</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">15%</td>
                  <td className="px-3 py-2 text-gray-600">
                    値上がり銘柄比率 (adv_pct) と SMA50 上比率の単純平均。指数とは独立した市場の幅
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    0.5 × adv_pct + 0.5 × pct_above_sma50
                  </td>
                </tr>
                <tr className="bg-violet-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-violet-700">S1</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">フロー (売買 + 海外勢)</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">15%</td>
                  <td className="px-3 py-2 text-gray-600">
                    売り圧力 5 日平均 (低いほど良い) と海外投資家ネット買い 4 週平均 (高いほど良い) を平均
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    avg(rank↓ sell_pressure_5d, rank↑ frgn_bal_4w_avg)
                  </td>
                </tr>
                <tr className="bg-violet-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-violet-700">S2</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">IV (恐怖指数)</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">10%</td>
                  <td className="px-3 py-2 text-gray-600">
                    日経 225 オプション ATM 5 銘柄の BaseVol 加重平均。低い = 落ち着き = 高スコア。
                    5 日で 10% 超急騰したら −20 ペナルティ
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    rank↓ market_iv, then penalty if Δ5d &gt; +10%
                  </td>
                </tr>
                <tr className="bg-violet-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-violet-700">S3</td>
                  <td className="px-3 py-2 text-gray-800 font-semibold">空売り + 先物 Basis</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">5%</td>
                  <td className="px-3 py-2 text-gray-600">
                    業種別空売り比率 (低いほどリスクオン) と TOPIX 先物 Basis% (Contango = 強気) を平均
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    avg(rank↓ short_ratio, rank↑ basis_pct)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 border border-[#e8eaed] p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Tier 構造</p>
            <ul className="space-y-1 text-xs text-gray-600">
              <li><span className="inline-block w-32 font-semibold text-emerald-700">Tier 1 (50%)</span>Core Price Action — M1 + M2 + M3</li>
              <li><span className="inline-block w-32 font-semibold text-amber-700">Tier 2 ( 5%)</span>Confirming — C1</li>
              <li><span className="inline-block w-32 font-semibold text-blue-700">Tier 3 (15%)</span>Independent Breadth — B1</li>
              <li><span className="inline-block w-32 font-semibold text-violet-700">Tier 4 (30%)</span>Sentiment & Risk — S1 + S2 + S3</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              スコアの色は <code className="bg-white px-1 rounded">≥80</code> 緑 (strong_bull) /{' '}
              <code className="bg-white px-1 rounded">≥60</code> 薄緑 (bull) /{' '}
              <code className="bg-white px-1 rounded">40-59</code> グレー (neutral) /{' '}
              <code className="bg-white px-1 rounded">≤39</code> 赤系 (bear) で MC v4 の regime 境界に整合。
            </p>
            <p className="text-xs text-gray-500 mt-2">
              <strong>valid_weight</strong>: 各日に有効だったファクターの重み合計。
              現状 daily_screener が IV / 空売り / Basis を取得していないため S2 + S3 (15%) が欠損し、
              通常 85% で推移。Premium データ取得追加で 100% に上がる予定。
            </p>
          </div>
        </div>
      </section>

      {/* ── MC v4 Dynamics — 3 Axes ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Dynamics (v4) — Velocity / Duration / Shock
        </h2>
        <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
          <p className="text-sm text-gray-600 mb-4">
            8 Factors が「現在の市場が <strong className="text-gray-900">どこにいるか</strong>」を測るのに対し、
            Dynamics は「<strong className="text-gray-900">どう動いているか</strong>」を 3 軸 13 列で捉えます。
            ダッシュボード上段 (Scorecard / IndexCards) の下に <code className="bg-gray-100 px-1 rounded">Velocity / Duration / Shock</code>{' '}
            の 3 Card で表示。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-[#e8eaed]">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">軸</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">列名</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">単位</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">何を測っているか</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eaed]">
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-emerald-700" rowSpan={4}>Velocity</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">mc_v4_delta_1d</td>
                  <td className="px-3 py-2 text-xs text-gray-500">±score</td>
                  <td className="px-3 py-2 text-gray-600">前日比の MC v4 変化。当日勢いの大小</td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">mc_v4_delta_5d</td>
                  <td className="px-3 py-2 text-xs text-gray-500">±score</td>
                  <td className="px-3 py-2 text-gray-600">5 営業日変化。週内のレジーム傾き</td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">mc_v4_delta_10d</td>
                  <td className="px-3 py-2 text-xs text-gray-500">±score</td>
                  <td className="px-3 py-2 text-gray-600">10 営業日変化。中期トレンド方向</td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">mc_v4_volatility_20d</td>
                  <td className="px-3 py-2 text-xs text-gray-500">stdev</td>
                  <td className="px-3 py-2 text-gray-600">過去 20 日の MC v4 標準偏差。レジーム揺れの大きさ</td>
                </tr>
                <tr className="bg-amber-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-amber-700" rowSpan={3}>Duration</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">regime_run_length</td>
                  <td className="px-3 py-2 text-xs text-gray-500">days</td>
                  <td className="px-3 py-2 text-gray-600">現レジームに連続滞在している営業日数</td>
                </tr>
                <tr className="bg-amber-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">days_since_regime_shift</td>
                  <td className="px-3 py-2 text-xs text-gray-500">days</td>
                  <td className="px-3 py-2 text-gray-600">直近のレジーム転換からの経過日数</td>
                </tr>
                <tr className="bg-amber-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">regime_shift_event</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">当日にレジーム転換が起きたか (1 = shift, 0 = no shift)</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono font-bold text-rose-700" rowSpan={6}>Shock</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">panic_flag_10</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">10 日窓のパニック (急落・急変動) 検知</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">panic_flag_15</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">15 日窓のパニック検知</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">panic_flag_20</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">20 日窓のパニック検知</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">relief_flag_10</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">10 日窓のリリーフ (急回復・急騰) 検知</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">relief_flag_15</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">15 日窓のリリーフ検知</td>
                </tr>
                <tr className="bg-rose-50/30">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">relief_flag_20</td>
                  <td className="px-3 py-2 text-xs text-gray-500">flag</td>
                  <td className="px-3 py-2 text-gray-600">20 日窓のリリーフ検知</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 border border-[#e8eaed] p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">読み方</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li>
                <span className="inline-block w-20 font-semibold text-emerald-700">Velocity</span>
                1d &gt; 0 で当日反発、5d/10d 全て正なら中期も上向き。Volatility 20d は揺れの絶対量で、急騰急落どちらでも増える
              </li>
              <li>
                <span className="inline-block w-20 font-semibold text-amber-700">Duration</span>
                run_length が長いほど現レジームが安定。shift_event = 1 の日はレジーム転換当日 = エントリー機会の可能性
              </li>
              <li>
                <span className="inline-block w-20 font-semibold text-rose-700">Shock</span>
                Card 上部の表示は最短窓 (10d) を優先。Panic 検知中 → リスクオフ、Relief 検知中 → 回復過程、いずれも OFF → Calm
              </li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              ※ 現状は最新日のみ表示。過去日選択時の Dynamics 表示は別 task で対応予定。
            </p>
          </div>
        </div>
      </section>

      {/* ── Glossary ──────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Glossary
        </h2>
        <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e8eaed]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[140px]">Term</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
              </tr>
            </thead>
            <tbody>
              {GLOSSARY.map((g, i) => (
                <tr
                  key={g.term}
                  className={`border-b border-[#f0f2f4] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
                >
                  <td className="px-4 py-2 font-mono text-xs font-bold text-gray-900">{g.term}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{g.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
