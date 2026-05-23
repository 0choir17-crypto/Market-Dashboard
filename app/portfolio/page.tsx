import { redirect } from 'next/navigation'

// Portfolio は Trading (/journal) に統合されました。
export default function PortfolioRedirect() {
  redirect('/journal')
}
