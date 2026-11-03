/**
 * Keyboard dispatcher (issue #178): one document-level keydown listener
 * that maps key events onto registry commands. Matching uses each
 * command's explicit KeyBinding list, never the display strings.
 *
 * Rules: keys typed into fields are text; Alt chords and unbound
 * Ctrl/Meta chords pass through (browser and devtools combos); nothing
 * fires while a kit Dialog is open; a command only fires in its views
 * (gap G1) and only while enabled; mid-gesture keys are swallowed unless
 * the command allows them (a tool switch would kill the live draw).
 * Gesture keys (Esc, Enter, Space, arrows) stay with the canvas engine.
 */
import { isDialogOpen } from '../ui/dialog';
import type { CommandRegistry, KeyBinding } from './commands';
import type { ViewId } from './state';

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el === null || typeof el.tagName !== 'string') return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  );
}

export function matchBinding(ev: KeyboardEvent, b: KeyBinding): boolean {
  const mod = ev.ctrlKey || ev.metaKey;
  if (Boolean(b.ctrl) !== mod) return false;
  if (b.shift !== undefined && b.shift !== ev.shiftKey) return false;
  return b.key.length === 1 ? ev.key.toLowerCase() === b.key.toLowerCase() : ev.key === b.key;
}

export interface KeyboardOptions {
  registry: CommandRegistry;
  view: () => ViewId;
  gestureInProgress: () => boolean;
  target?: Document;
}

export function installKeyboard(opts: KeyboardOptions): () => void {
  const doc = opts.target ?? document;
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.defaultPrevented || ev.altKey) return;
    if (isTypingTarget(ev.target)) return;
    if (isDialogOpen()) return;
    const view = opts.view();
    for (const cmd of opts.registry.list()) {
      if (!cmd.keys || !cmd.keys.some((b) => matchBinding(ev, b))) continue;
      if (cmd.views && !cmd.views.includes(view)) continue;
      if (opts.gestureInProgress() && !cmd.allowMidGesture) return;
      if (cmd.enabled && !cmd.enabled()) return;
      ev.preventDefault();
      if (cmd.onKey) cmd.onKey();
      else cmd.run?.();
      return;
    }
  };
  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
