import Game from './Game';

export const metadata = { title: 'Voxel Realms' };

export default async function PlayPage({ params }) {
  const { room } = await params;
  return <Game room={room.toUpperCase().replace(/[^A-Z0-9]/g, '')} />;
}
