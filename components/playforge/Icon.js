import { ICON_SPRITE } from '@/playforge/web/icons';

// <Icon name="play" /> draws sprite symbol "i-play". fill: solid shapes (play, dice dots).
export function Icon({ name, fill, className = '' }) {
  return <svg className={`i${fill ? ' fill' : ''}${className ? ' ' + className : ''}`} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}
export function Mark({ className }) {
  return <svg className={className} aria-hidden="true"><use href="#pf-mark" /></svg>;
}
// Rendered once by the shell.
export function IconSprite() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} /></svg>;
}
