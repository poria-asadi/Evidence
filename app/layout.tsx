import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EvidenceFlow — Systematic Review Workspace',
  description:
    'A guided workspace for importing, screening, and extracting evidence with transparent AI assistance and researcher approval.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
