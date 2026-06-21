import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SmartDesk',
  description: '智能工单系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
