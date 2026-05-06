import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="section">
      <div className="container" style={{ textAlign: 'center', padding: '6rem 2rem' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '3rem', marginBottom: '1rem' }}>
          404
        </h1>
        <p style={{ fontFamily: 'Roboto Slab, serif', color: 'var(--text-light)', maxWidth: 480, margin: '0 auto 2rem', lineHeight: 1.7 }}>
          The page you're looking for has moved or doesn't exist. Try the navigation above, or head back home.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-primary">Back to home</Link>
          <Link href="/issues" className="btn btn-outline">View Issue Tracker</Link>
        </div>
      </div>
    </main>
  );
}
