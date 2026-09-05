import type { Metadata } from 'next'
import { IBM_Plex_Mono, Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/NavBar'
import Providers from '@/components/Providers'

// 変数名は globals.css の @theme（--font-sans / --font-mono への配線）と対応。
// 欧文・数値は TradingView と同じシステムフォントスタックで解決するので webfont は読まない。
// 等幅（Plex Mono）は銘柄コードと日付・時刻という「識別子」にだけ使う。
const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto',
})

export const metadata: Metadata = {
  title: 'Market Dashboard',
  description: '日本株マーケットコンディション',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${ibmPlexMono.variable} ${notoSansJP.variable}`}>
      <body className="antialiased">
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
