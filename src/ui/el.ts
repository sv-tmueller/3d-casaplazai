/**
 * Tiny DOM builder for the component kit (issue #178, design §5.2).
 * `el(tag, props, ...children)` returns a typed element; nothing here
 * knows about the editor, the viewer or the app.
 */
import { iconMarkup, type IconKey } from './icons';

export type Child = Node | string | number | null | undefined | false;

type Listeners = {
  [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
};

export interface ElProps {
  class?: string;
  text?: string;
  /** Attributes; `false`/`null`/`undefined` omit, `true` sets "". */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  on?: Listeners;
  /** Shorthand for data-testid. */
  testid?: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (props.dataset) {
    for (const [name, value] of Object.entries(props.dataset)) node.dataset[name] = value;
  }
  if (props.testid) node.dataset.testid = props.testid;
  if (props.on) {
    for (const [type, fn] of Object.entries(props.on)) {
      if (fn) node.addEventListener(type, fn as EventListener);
    }
  }
  append(node, ...children);
  return node;
}

/** Append children, skipping null/false; strings become text nodes. */
export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Inline SVG icon element (aria-hidden, never part of a name). */
export function icon(key: IconKey): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = iconMarkup(key);
  return tpl.content.firstElementChild as SVGSVGElement;
}

let idCounter = 0;
/** Document-unique id for label/aria wiring. */
export function uid(prefix = 'ui'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
