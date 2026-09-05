'use client'

// フォント桁揃えの検証ページ（開発ビルド限定）。
//
// Trebuchet MS は 1996 年の TrueType で、OpenType の tnum（tabular figures）を
// 持たない可能性がある。その場合 font-variant-numeric: tabular-nums は無言で
// 無効化され、表の数字の桁がずれる。コンテナ側では実フォントが無く測れないので、
// 実機（Windows / macOS / iPhone）でこのページを開いて判定する。
//
// 判定: 「0123456789」と「1111111111」の幅が一致すれば等幅数字。
// ずれていたら globals.css の --font-sans 先頭を IBM Plex Sans に差し替える。

import { useEffect, useState } from 'react'

const SAMPLE_A = '0123456789'
const SAMPLE_B = '1111111111'

const STACKS: { name: string; css: string; note: string }[] = [
  {
    name: '現在の --font-sans（TradingView スタック）',
    css: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
    note: '本番で使われているスタック。ここが「一致」なら変更不要',
  },
  {
    name: 'Trebuchet MS 単体',
    css: '"Trebuchet MS", sans-serif',
    note: 'Windows / macOS ではこれが当たる。iOS には無く -apple-system が拾う',
  },
  {
    name: 'IBM Plex Sans（代替案）',
    css: '"IBM Plex Sans", sans-serif',
    note: 'tnum を正式サポート。未インストールなら意味のある測定にならない',
  },
  {
    name: 'IBM Plex Mono（現行の等幅・対照用）',
    css: 'var(--font-plex), ui-monospace, monospace',
    note: '等幅なので必ず一致する。測定が動いていることの確認に使う',
  },
]

function Row({ name, css, note }: { name: string; css: string; note: string }) {
  const [widths, setWidths] = useState<{ a: number; b: number } | null>(null)

  useEffect(() => {
    const measure = (text: string) => {
      const el = document.createElement('span')
      el.style.cssText = `position:fixed;visibility:hidden;white-space:pre;font-size:16px;font-family:${css}`
      el.style.fontVariantNumeric = 'tabular-nums'
      el.textContent = text
      document.body.appendChild(el)
      const w = el.getBoundingClientRect().width
      document.body.removeChild(el)
      return w
    }
    setWidths({ a: measure(SAMPLE_A), b: measure(SAMPLE_B) })
  }, [css])

  // 1px 未満の差は丸め誤差とみなす
  const tabular = widths ? Math.abs(widths.a - widths.b) < 1 : null

  return (
    <tr className="border-t-[0.5px] border-[var(--border)]">
      <td className="px-3 py-3 align-top">
        <p className="text-body">{name}</p>
        <p className="text-caption text-[var(--text-muted)] mt-0.5">{note}</p>
        <code className="text-caption text-[var(--text-muted)] break-all">{css}</code>
      </td>
      <td className="px-3 py-3" style={{ fontFamily: css, fontVariantNumeric: 'tabular-nums' }}>
        <div className="text-[16px]">{SAMPLE_A}</div>
        <div className="text-[16px]">{SAMPLE_B}</div>
      </td>
      <td className="px-3 py-3 text-right num text-[var(--text-secondary)] whitespace-nowrap">
        {widths ? `${widths.a.toFixed(2)} / ${widths.b.toFixed(2)}` : '測定中…'}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        {tabular === null ? (
          <span className="text-[var(--sem-idle-fg)]">—</span>
        ) : tabular ? (
          <span className="text-[var(--sem-strong-fg)]">一致（等幅数字）</span>
        ) : (
          <span className="text-[var(--sem-weak-fg)]">ずれ（桁が揃わない）</span>
        )}
      </td>
    </tr>
  )
}

export default function FontDebugPage() {
  if (process.env.NODE_ENV === 'production') {
    return <main className="p-8 text-small text-[var(--text-muted)]">開発ビルドでのみ利用できます。</main>
  }
  return <FontDebugInner />
}

function FontDebugInner() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-title font-medium">Font — 桁揃えの検証</h1>
      <p className="text-small text-[var(--text-muted)] mt-1 max-w-2xl">
        表の数字が桁で揃うかを実機で確認するためのページ。1 行目「現在の --font-sans」が
        <strong className="font-medium">一致</strong>なら変更不要。
        <strong className="font-medium">ずれ</strong>なら
        <code className="font-mono mx-1">app/globals.css</code>
        の <code className="font-mono">--font-sans</code> 先頭を IBM Plex Sans に差し替える。
      </p>

      <div className="mt-6 bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-caption tracking-wide text-[var(--text-muted)]">
                スタック
              </th>
              <th className="px-3 py-2 text-left text-caption tracking-wide text-[var(--text-muted)]">
                見本
              </th>
              <th className="px-3 py-2 text-right text-caption tracking-wide text-[var(--text-muted)]">
                幅 (px)
              </th>
              <th className="px-3 py-2 text-right text-caption tracking-wide text-[var(--text-muted)]">
                判定
              </th>
            </tr>
          </thead>
          <tbody>
            {STACKS.map(s => (
              <Row key={s.name} {...s} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 実際の表と同じ組み方で目視確認する用。桁が縦に揃っているかを見る。 */}
      <h2 className="text-caption tracking-wide text-[var(--text-muted)] mt-8 mb-2">
        実際の表と同じ組み（右揃え + .num）
      </h2>
      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] inline-block">
        <table className="text-body">
          <tbody>
            {[1234.5, 99.25, 1.0, 100000.75, 7.5, 22.25].map(v => (
              <tr key={v} className="border-t-[0.5px] border-[var(--border)] first:border-t-0">
                <td className="px-4 py-1.5 text-right num">{v.toFixed(2)}</td>
                <td className="px-4 py-1.5 text-right num">{(v * 3).toFixed(2)}</td>
                <td className="px-4 py-1.5 text-right font-mono">{v.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-[var(--text-muted)] mt-2">
        左 2 列がサンセリフ + .num、右 1 列が等幅（対照）。左が揃っていなければ差し替えが必要。
      </p>
    </main>
  )
}
