'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEngine } from '@/components/playforge/engine';
import AvatarScreen, { AvatarLoading } from '@/components/playforge/avatar/AvatarScreen';

// /avatar: the avatar and skin editor (components/playforge/avatar). Back returns to the home screen.
export default function AvatarPage() {
  const E = useEngine(), router = useRouter();
  const goHome = useCallback(() => router.push('/', { scroll: false }), [router]);
  if (!E) return <AvatarLoading />;
  return <AvatarScreen E={E} onHome={goHome} />;
}
