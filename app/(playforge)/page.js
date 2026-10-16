'use client';
// TEMPORARY stand-in: replaced by the home screen (components/playforge/home).
import Link from 'next/link';
import { useEngine } from '@/components/playforge/engine';

export default function HomePage() {
  const E = useEngine();
  if (!E) return <p style={{ padding: 16 }}>Loading PlayForge…</p>;
  return (
    <main style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <h1>PlayForge</h1>
      <ul>{E.GAMES.map(g => <li key={g.id}><Link href={`/g/${g.id}`}>{g.title}</Link></li>)}</ul>
    </main>
  );
}
