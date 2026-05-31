#!/usr/bin/env python3
"""
Generate SQL INSERTs for `trades` from SBI約定履歴 CSV (Shift-JIS).

Defaults:
  - 投信 (mutual fund) rows: skipped (no ticker).
  - Sells without a prior buy in the CSV window: skipped & listed.
  - Splits: FIFO match — one buy lot may produce multiple trade rows.
  - Remaining open lots → status='open' (exit fields NULL).

Usage:
  python3 scripts/imports/sbi_to_trades.py \
    /path/to/SBI_export.csv \
    > supabase/imports/trades_import.sql
"""
from __future__ import annotations
import csv
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class Lot:
    entry_date: str
    entry_price: float
    shares: int
    market: str
    account: str  # 預り (NISA/特定/一般)


@dataclass
class TradeRow:
    ticker: str
    company_name: str
    entry_date: str
    entry_price: float
    shares: int
    exit_date: str | None
    exit_price: float | None
    pnl: float | None
    pnl_pct: float | None
    result: str | None
    status: str
    memo: str


def parse_csv(path: Path) -> list[dict]:
    with path.open('r', encoding='utf-8') as f:
        lines = [l for l in f.readlines() if l.strip()]
    header_idx = next(i for i, l in enumerate(lines) if l.startswith('約定日'))
    reader = csv.DictReader(lines[header_idx:])
    return list(reader)


def fmt_date(s: str) -> str:
    return datetime.strptime(s.strip(), '%Y/%m/%d').strftime('%Y-%m-%d')


def sql_str(s: str | None) -> str:
    if s is None:
        return 'NULL'
    return "'" + s.replace("'", "''") + "'"


def sql_num(v) -> str:
    return 'NULL' if v is None else f'{v:.4f}'.rstrip('0').rstrip('.')


def main(csv_path: str) -> None:
    rows = parse_csv(Path(csv_path))

    # Group transactions by ticker (skip funds — no code).
    by_ticker: dict[str, list[dict]] = defaultdict(list)
    fund_count = 0
    for r in rows:
        deal = r['取引']
        code = r['銘柄コード'].strip()
        if '投信' in deal or not code:
            fund_count += 1
            continue
        by_ticker[code].append(r)

    trades: list[TradeRow] = []
    skipped_sells: list[str] = []  # sells with no matching buy

    for code, txns in by_ticker.items():
        # Sort by 約定日 ascending. For same date, buys before sells so the
        # buy lot is available to match a same-day sell.
        txns.sort(key=lambda r: (r['約定日'], 0 if '買' in r['取引'] else 1))
        lots: deque[Lot] = deque()
        for r in txns:
            deal = r['取引']
            qty = int(r['約定数量'])
            price = float(r['約定単価'])
            date = fmt_date(r['約定日'])
            company = r['銘柄'].strip()
            market = r['市場'].strip()
            account = r['預り'].strip()
            if '買' in deal:
                lots.append(Lot(date, price, qty, market, account))
            elif '売' in deal:
                remaining = qty
                while remaining > 0 and lots:
                    lot = lots[0]
                    take = min(lot.shares, remaining)
                    pnl = (price - lot.entry_price) * take
                    pnl_pct = (price / lot.entry_price - 1) * 100 if lot.entry_price else None
                    result = 'WIN' if pnl >= 0 else 'LOSS'
                    memo = f'{lot.market}/{lot.account} → {market}'
                    trades.append(TradeRow(
                        ticker=code,
                        company_name=company,
                        entry_date=lot.entry_date,
                        entry_price=lot.entry_price,
                        shares=take,
                        exit_date=date,
                        exit_price=price,
                        pnl=pnl,
                        pnl_pct=pnl_pct,
                        result=result,
                        status='closed',
                        memo=memo,
                    ))
                    lot.shares -= take
                    remaining -= take
                    if lot.shares == 0:
                        lots.popleft()
                if remaining > 0:
                    skipped_sells.append(f'  {code} {company} {date} qty={remaining} price={price}')
        # Any remaining lots = still open
        for lot in lots:
            trades.append(TradeRow(
                ticker=code,
                company_name=company,
                entry_date=lot.entry_date,
                entry_price=lot.entry_price,
                shares=lot.shares,
                exit_date=None,
                exit_price=None,
                pnl=None,
                pnl_pct=None,
                result=None,
                status='open',
                memo=f'{lot.market}/{lot.account}',
            ))

    # Emit SQL
    out = sys.stdout
    out.write('-- Generated from SBI 約定履歴 CSV\n')
    out.write(f'-- Source rows: {len(rows)} (skipped {fund_count} 投信 rows)\n')
    out.write(f'-- Output trades: {len(trades)} '
              f'({sum(1 for t in trades if t.status == "closed")} closed, '
              f'{sum(1 for t in trades if t.status == "open")} open)\n')
    if skipped_sells:
        out.write(f'-- Skipped {len(skipped_sells)} unmatched sells '
                  f'(position predates CSV window — entry data unknown):\n')
        for s in skipped_sells:
            out.write(f'--{s}\n')
    out.write('\n')
    out.write('BEGIN;\n\n')
    out.write('INSERT INTO trades\n')
    out.write('  (ticker, company_name, entry_date, entry_price, shares,\n')
    out.write('   exit_date, exit_price, pnl, pnl_pct, result, status, memo)\n')
    out.write('VALUES\n')

    values = []
    for t in trades:
        values.append(
            '  (' + ', '.join([
                sql_str(t.ticker),
                sql_str(t.company_name),
                sql_str(t.entry_date),
                sql_num(t.entry_price),
                str(t.shares),
                sql_str(t.exit_date),
                sql_num(t.exit_price),
                sql_num(t.pnl),
                sql_num(t.pnl_pct),
                sql_str(t.result),
                sql_str(t.status),
                sql_str(t.memo),
            ]) + ')'
        )
    out.write(',\n'.join(values))
    out.write(';\n\nCOMMIT;\n')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: sbi_to_trades.py <utf8-csv-path>', file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])
