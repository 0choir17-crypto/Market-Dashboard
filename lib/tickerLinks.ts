// Ticker click rule (project-wide):
//   - Code → TradingView (chart view, technical analysis)
//   - Name → Shikiho (会社四季報, fundamentals & company info)
//
// Always render code/name as <a target="_blank" rel="noopener noreferrer"> when
// surfacing a ticker. Use these helpers so the URLs stay consistent.

export function tradingViewUrl(code: string): string {
  return `https://jp.tradingview.com/chart/?symbol=TSE:${code}`
}

export function shikihoUrl(code: string): string {
  return `https://shikiho.toyokeizai.net/stocks/${code}`
}
