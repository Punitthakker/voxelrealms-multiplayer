'use client';
// TEMPORARY stand-in: replaced by the game screen (components/playforge/game).
import { use, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEngine } from '@/components/playforge/engine';

export default function GamePage({ params }) {
  const { id } = use(params);
  const E = useEngine(), host = useRef(null), router = useRouter();
  useEffect(() => {
    if (!E || !host.current) return;
    const def = E.gameById(id); if (!def) return;
    E.Game.enter(def, { host: host.current, test: true, onExit: () => router.push('/') });
    return () => E.Game.leave(true);
  }, [E, id, router]);
  return <div ref={host} style={{ position: 'fixed', inset: 0 }} />;
}
