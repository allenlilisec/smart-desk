import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartDesk',
  description: 'SmartDesk 智能工单平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
