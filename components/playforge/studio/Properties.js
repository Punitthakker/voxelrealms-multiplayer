'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';
import { ColorPick, Field, NumInput, Range, Select, Switch, TextInput, Xyz } from './fields';

const cap = s => s[0].toUpperCase() + s.slice(1);
const same = (ps, f) => ps.every(p => f(p) === f(ps[0]));

// The Properties panel for the selected parts. It is rebuilt for every new selection (key), and every edit goes
// to the ids it was built for, never to whatever is selected when a field commits.
export default function Properties({ E }) {
  const sel = useStore(E.studioStore, s => s.sel);
  const rev = useStore(E.studioStore, s => s.rev);
  const S = E.Studio, ps = S.doc ? sel.map(id => S.byId(id)).filter(Boolean) : [];
  if (!ps.length) {
    return (
      <div className="st-props" id="st-props">
        <p className="st-empty">Select a part to change how it looks and what it does. {E.IS_TOUCH ? 'Tap' : 'Click'} it in the 3D view or pick it in the Explorer.</p>
      </div>
    );
  }
  return <PropsForm key={sel.join(',')} E={E} ids={sel} ps={ps} rev={rev} />;
}

function PropsForm({ E, ids, ps }) {
  const S = E.Studio, r3 = E.r3, clamp = E.clamp;
  const edit = (label, fn) => S.editProps(label, fn, ids);
  const one = ps.length === 1 ? ps[0] : null, g = S.selGroup();
  const color = ps[0].color;
  const material = same(ps, p => p.material) ? ps[0].material : '';
  const behavior = same(ps, p => p.behavior || 'none') ? ps[0].behavior || 'none' : '';
  const info = E.BEHAVIOR_INFO[behavior];
  const tag = same(ps, p => p.tag || '') ? ps[0].tag || '' : '';
  const anchored = ps.every(p => p.anchored !== false), solid = ps.every(p => p.canCollide !== false), locked = ps.every(p => !!p.locked);
  const isSpawn = one && one.shape === 'spawn', start = isSpawn && S.startSpawn() === one;
  return (
    <div className="st-props" id="st-props">
      {g && (
        <Field label="Group name">
          <TextInput value={g.name} max={40} label="Group name" onCommit={v => S.renameGroup(g.id, v)} />
        </Field>
      )}
      {one ? (
        <>
          <Field label="Name">
            <TextInput value={one.name} max={40} label="Name" onCommit={v => edit('Rename', p => { p.name = E.WordFilter.clean(v.trim()).slice(0, 40) || p.shape; })} />
          </Field>
          {isSpawn && <p className="help st-spawn-note">{start ? 'Players start here. It is the first Spawn in the Explorer.' : 'Players start on the first Spawn in the Explorer, not this one.'}</p>}
          <Field label="Position"><Xyz label="Position" vals={one.pos} signed onCommit={(k, v) => edit('Move', p => { p.pos[k] = r3(clamp(v, -5000, 5000)); })} /></Field>
          <Field label="Size"><Xyz label="Size" vals={one.size} onCommit={(k, v) => edit('Resize', p => { p.size[k] = r3(clamp(Math.abs(v), 0.05, 2048)); })} /></Field>
          <Field label="Rotation (degrees)"><Xyz label="Rotation" vals={one.rot} signed onCommit={(k, v) => edit('Rotate', p => { p.rot[k] = Math.round(clamp(v, -36000, 36000) * 100) / 100; })} /></Field>
        </>
      ) : (
        <p className="st-empty">{ps.length} parts {g ? 'in this group' : 'selected'}. Changes below apply to all of them.</p>
      )}

      <Field label="Color">
        <div className="st-sw">
          {E.ST_COLORS.map(c => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={'Color ' + c}
              aria-pressed={same(ps, p => String(p.color).toUpperCase()) && c.toUpperCase() === String(color).toUpperCase()}
              onClick={() => edit('Color', p => { p.color = c; })} />
          ))}
        </div>
        <div className="st-color">
          <ColorPick value={color} onCommit={v => edit('Color', p => { p.color = v; })} />
          <TextInput value={color} max={7} label="Color code" onCommit={v => { const h = E.normHex(v.trim()); if (h) edit('Color', p => { p.color = h; }); }} />
        </div>
      </Field>

      <Field label="Material">
        <Select label="Material" value={material}
          opts={[...(material ? [] : [['', 'Mixed']]), ...E.ST_MATERIALS.map(m => [m, cap(m)])]}
          onChange={v => { if (v) edit('Material', p => { p.material = v; }); }} />
      </Field>
      <Field label="See-through">
        <Range label="See-through" min="0" max="1" step="0.05" value={ps[0].transparency || 0} onCommit={v => edit('See-through', p => { p.transparency = clamp(v, 0, 1); })} />
      </Field>

      <Switch title="Anchored" help="Unanchored parts fall when the game starts" on={anchored}
        onChange={on => edit(on ? 'Anchor' : 'Unanchor', p => { if (on) delete p.anchored; else p.anchored = false; })} />
      <Switch title="Solid" help="Players bump into it and can stand on it" on={solid}
        onChange={on => edit(on ? 'Make solid' : 'Make walk-through', p => { if (on) delete p.canCollide; else p.canCollide = false; })} />
      <Switch title="Locked" help={`${E.IS_TOUCH ? 'Taps' : 'Clicks'} in the 3D view pass through it. Pick it in the Explorer to change it`} on={locked}
        onChange={on => edit(on ? 'Lock' : 'Unlock', p => { if (on) p.locked = true; else delete p.locked; })} />

      <Field label="What it does">
        <Select label="What it does" value={behavior}
          opts={[...(behavior ? [] : [['', 'Mixed']]), ...Object.entries(E.BEHAVIOR_INFO).map(([k, v]) => [k, v.label])]}
          onChange={v => { if (v) edit('Behavior', p => S.setBehavior(p, v)); }} />
        {info && info.help && <p className="help">{info.help}</p>}
      </Field>
      {one && one.behavior && info && info.params && info.params.map(prm => <Param key={prm.k} E={E} ids={ids} part={one} prm={prm} />)}

      <Field label="Tag">
        <TextInput value={tag} max={24} label="Tag" placeholder="hazard"
          onCommit={v => { const t = v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24); edit('Tag', p => { if (t) p.tag = t; else delete p.tag; }); }} />
        <p className="help">Rules can look for tags. &quot;hazard&quot; makes any part deadly, even moving ones.</p>
      </Field>

      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={() => S.duplicate()}><Icon name="copy" />Duplicate</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => S.remove()}><Icon name="trash" />Delete</button>
      </div>
    </div>
  );
}

// One behavior parameter. Vector parameters read the part's current value when an axis is committed, so
// typing X, then Y, then Z keeps all three.
function Param({ E, ids, part, prm }) {
  const S = E.Studio, cur = part.bp && part.bp[prm.k] !== undefined ? part.bp[prm.k] : prm.def;
  let ctl;
  if (prm.opts) ctl = <Select label={prm.label} value={prm.opts.includes(cur) ? cur : prm.def} opts={prm.opts.map(o => [o, o.toUpperCase()])} onChange={v => S.setParam(ids, prm, v)} />;
  else if (prm.vec) ctl = <Xyz label={prm.label} vals={E.finite3(cur, prm.def)} signed onCommit={(k, v) => S.setParam(ids, prm, v, k)} />;
  else ctl = <NumInput label={prm.label} value={Number(cur)} signed={prm.min < 0} min={prm.min} max={prm.max} onCommit={v => S.setParam(ids, prm, v)} />;
  return <Field label={prm.label}>{ctl}</Field>;
}
