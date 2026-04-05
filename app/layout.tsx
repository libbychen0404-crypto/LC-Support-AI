import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LC AI Support',
  description: 'AI-assisted customer support platform with deterministic workflow, case continuity, and human handoff.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
