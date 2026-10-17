'use client';
import Link from 'next/link';
import { Modal } from '../Modal';
import { Icon } from '../Icon';
import { PlayLabel, Thumb } from './Tiles';
import { HOME_CATS, ago, catsOf, fmtCount, likeKey, plural } from './catalog';

// The game page sheet: picture, kind chips, creator, players now, likes, description, Play, and the actions that fit
// the game. Your drafts get Edit in Studio, Rename, Unpublish and Delete; other games get Like and Edit a copy.
// A game of yours whose draft isn't on this device gets Rename and Unpublish too, so it can still be cleaned up.
// state: {canPublish, online (players now or null), like {liked, n} | null, gone (unpublished meanwhile), shareLabel}
export default function GamePage({ E, entry, state, act }) {
  const open = !!entry;
  return (
    <Modal open={open} onClose={act.close} id="gamepage-modal" className="gp-sheet" titleId="gp-title" hideClose>
      {open ? <Body E={E} e={entry} s={state} act={act} /> : null}
    </Modal>
  );
}

function Body({ E, e, s, act }) {
  const draft = e.kind === 'draft', unpub = draft && !e.published, orphan = e.kind === 'community' && e.mine;
  const showLikes = !!(s.canPublish && likeKey(e)) && !s.gone;
  const n = unpub ? null : s.online;
  const onlineText = n == null ? (unpub ? 'Only you' : 'Solo') : !n ? 'Nobody playing right now' : n === 1 ? '1 player here now' : `${n} players here now`;
  const like = s.like || { liked: false, n: 0 };

  const more = [];
  if (draft) {
    more.push(<Link key="studio" href={`/studio/${e.id}`} scroll={false} className="btn" onClick={act.navigate}><Icon name="cube" /><span className="lbl">Edit in Studio</span></Link>);
    more.push(<button key="rename" type="button" className="btn" onClick={() => act.rename(e)}><Icon name="pencil" /><span className="lbl">Rename</span></button>);
    if (e.published && s.canPublish) more.push(<button key="unpub" type="button" className="btn" onClick={() => act.unpublish(e)}><Icon name="download" /><span className="lbl">Unpublish</span></button>);
    more.push(<button key="delete" type="button" className="btn btn-danger" onClick={() => act.remove(e)}><Icon name="trash" /><span className="lbl">Delete</span></button>);
  } else {
    if (showLikes) {
      more.push(
        <button key="like" type="button" id="gp-like" className="btn gp-like" aria-pressed={like.liked ? 'true' : 'false'}
          aria-label={`${like.liked ? 'Liked' : 'Like'}, ${plural(like.n, 'like', 'likes')}`} onClick={() => act.like(e)}>
          <Icon name="heart" fill={like.liked} /><span className="lbl">{like.liked ? 'Liked' : 'Like'}</span><span className="n">{fmtCount(like.n)}</span>
        </button>,
      );
    }
    if (!s.gone) more.push(<Link key="copy" href={`/studio/new?remix=${e.id}`} scroll={false} className="btn" onClick={act.navigate}><Icon name="copy" /><span className="lbl">Edit a copy</span></Link>);
    if (orphan && s.canPublish && !s.gone) {
      more.push(<button key="rename" type="button" className="btn" onClick={() => act.rename(e)}><Icon name="pencil" /><span className="lbl">Rename</span></button>);
      more.push(<button key="unpub" type="button" className="btn" onClick={() => act.unpublish(e)}><Icon name="download" /><span className="lbl">Unpublish</span></button>);
    }
  }
  const moreCls = 'gp-more' + (more.length === 4 || more.length === 2 ? ' two' : more.length === 3 ? ' three' : '');

  let note = '';
  if (s.gone) note = "This game was unpublished, so it can't be played any more.";
  else if (unpub) note = s.canPublish ? 'Only you can see this draft. Publish it from Studio so others can play.' : 'Only you can see this draft. It is saved on this device.';
  else if (orphan) note = s.canPublish ? "This game's draft isn't on this device. You can still rename or unpublish it here, or edit a copy." : "This game's draft isn't on this device.";

  const chips = [];
  if (e.featured) chips.push(['Featured', 'ember']);
  for (const c of catsOf(e)) chips.push([HOME_CATS.find(x => x.id === c).label, '']);
  if (draft) chips.push(e.published ? ['Published', 'mint'] : ['Draft', 'ink']);
  else if (e.kind === 'community') chips.push([e.mine ? 'Yours' : 'Community', '']);

  return (
    <>
      <div className="gp-art" id="gp-art">
        <Thumb E={E} entry={e} className="gp-pic" want urgent />
        {s.shareLabel && !unpub && !s.gone ? (
          <button type="button" className="gp-share" onClick={() => act.share(e)} aria-label={`${s.shareLabel}: a link to ${e.title}`}>
            <Icon name="upload" /><span>{s.shareLabel}</span>
          </button>
        ) : null}
        <button type="button" className="gp-close" onClick={act.close} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="gp-body">
        <div className="gp-chips" id="gp-chips">{chips.map(([t, c]) => <span key={t} className={'gp-chip' + (c ? ' ' + c : '')}>{t}</span>)}</div>
        <h2 id="gp-title">{e.title}</h2>
        <div className="gp-meta">
          <span><Icon name="person" /><span id="gp-creator">by {e.creator}</span></span>
          <span id="gp-online-wrap" className={n ? 'live' : ''}><span className="dot-online" /><span id="gp-online">{onlineText}</span></span>
          {showLikes ? <span id="gp-likes-wrap"><Icon name="heart" /><span id="gp-likes">{like.n === 1 ? '1 like' : `${fmtCount(like.n)} likes`}</span></span> : null}
          {draft ? <span id="gp-edited-wrap"><Icon name="clock" /><span id="gp-edited">{`${ago(e.updatedAt)} · ${plural(e.parts, 'part', 'parts')}`}</span></span> : null}
        </div>
        <p className="gp-desc" id="gp-desc">{e.desc || (draft ? 'No description yet. Add one in Studio.' : 'No description yet.')}</p>
        <div className="gp-actions">
          {s.gone ? (
            <button type="button" className="btn btn-ember gp-play" id="gp-play" disabled><Icon name="play" fill /><span id="gp-play-label">Play</span></button>
          ) : (
            <Link href={`/g/${e.id}`} scroll={false} className="btn btn-ember gp-play" id="gp-play" data-autofocus onClick={act.navigate}>
              <Icon name="play" fill /><PlayLabel className="" id="gp-play-label" />
            </Link>
          )}
          {more.length ? <div className={moreCls} id="gp-more">{more}</div> : null}
          {note ? <p className="help gp-note" id="gp-note">{note}</p> : null}
        </div>
      </div>
    </>
  );
}
