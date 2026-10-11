'use client';
import { useEffect, useState } from 'react';
import { loadName, storeName } from '@/lib/playerName';
import s from './lobby.module.css';

export default function Lobby() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setName(loadName()), []);

  const ready = name.trim().length > 0;

  // Full page load (not client routing) so each world starts the game script fresh.
  const go = c => { storeName(name.trim()); window.location.href = '/play/' + c; };

  async function create() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/worlds', { method: 'POST' });
      if (!r.ok) throw new Error();
      go((await r.json()).code);
    } catch {
      setError("Couldn't create a world. Is the server running?");
      setBusy(false);
    }
  }

  async function join(e) {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c) return;
    setBusy(true); setError('');
    const r = await fetch('/api/worlds/' + c).catch(() => null);
    if (r?.ok) return go(c);
    setError(r?.status === 404 ? `No world with code ${c}.` : "Couldn't reach the server.");
    setBusy(false);
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.title}>Voxel Realms</h1>
        <p className={s.sub}>Build an endless voxel world together. Share the link and friends join instantly.</p>

        <label className={s.label} htmlFor="name">Your name</label>
        <input id="name" className={s.input} value={name} maxLength={16} placeholder="Steve"
          onChange={e => setName(e.target.value)} autoComplete="nickname" />

        <button className={s.big} disabled={!ready || busy} onClick={create}>Create a new world</button>

        <div className={s.or}><span>or join a friend</span></div>

        <form className={s.join} onSubmit={join}>
          <input className={s.input} value={code} maxLength={12} placeholder="World code"
            onChange={e => setCode(e.target.value.toUpperCase())} aria-label="World code" />
          <button className={s.ghost} disabled={!ready || busy || !code.trim()}>Join</button>
        </form>

        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </main>
  );
}
