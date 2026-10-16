import '@/playforge/web/playforge.css';
import Shell from '@/components/playforge/Shell';

export const metadata = { title: 'PlayForge', description: 'Play, build and share 3D games in your browser.' };

export default function PlayForgeLayout({ children }) {
  return <Shell>{children}</Shell>;
}
