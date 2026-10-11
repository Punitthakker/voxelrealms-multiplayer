'use client';
import { useEffect, useState } from 'react';
import markup from '@/components/gameMarkup';
import { loadName, storeName } from '@/lib/playerName';
import './game.css';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

function loadScript(src) {
  return new Promise(resolve => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.body.append(el);
  });
}

export default function Game({ room }) {
  // checking -> (missing | needName | play)
  const [stage, setStage] = useState('checking');
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/worlds/' + room)
      .then(r => {
        if (r.status === 404) return setStage('missing');
        const n = loadName();
        setName(n);
        setStage(n ? 'play' : 'needName');
      })
      .catch(() => setStage('missing'));
  }, [room]);

  useEffect(() => {
    if (stage !== 'play' || window.__vrStarted) return;
    window.__vrStarted = true;
    window.VR_ROOM = room;
    window.VR_NAME = name;
    loadScript(THREE_URL).then(ok => {
      if (!ok) window.__tfail = 1;
      loadScript('/game/game.js');
    });
  }, [stage, room, name]);

  if (stage === 'play') return <div dangerouslySetInnerHTML={{ __html: markup }} />;

  return (
    <div className="ov">
      <div className="card" style={{ textAlign: 'center' }}>
        <h1>Voxel Realms</h1>
        {stage === 'checking' && <p>Finding world {room}…</p>}
        {stage === 'missing' && <>
          <p>World <b>{room}</b> doesn&apos;t exist or the server can&apos;t be reached.</p>
          <a className="big" style={{ display: 'block', textDecoration: 'none' }} href="/">Back to lobby</a>
        </>}
        {stage === 'needName' && <form onSubmit={e => {
          e.preventDefault();
          if (!name.trim()) return;
          storeName(name.trim());
          setName(name.trim());
          setStage('play');
        }}>
          <p>You&apos;re joining world <b>{room}</b>. Pick a name.</p>
          <input id="ps" value={name} maxLength={16} placeholder="Your name" autoFocus
            onChange={e => setName(e.target.value)} />
          <button className="big" disabled={!name.trim()}>Join world</button>
        </form>}
      </div>
    </div>
  );
}
