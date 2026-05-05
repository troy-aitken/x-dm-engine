import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'x-dm-engine',
  description: 'Auto-DM users who like or reply to your tweets',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
