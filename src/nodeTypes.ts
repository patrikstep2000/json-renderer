/**
 * Tags JsonRenderer may instantiate. Anything else is ignored so templates cannot request arbitrary DOM (e.g. `script`).
 * Extend carefully if you need more elements.
 */
export const ALLOWED_TAGS = new Set([
  'div',
  'section',
  'header',
  'footer',
  'main',
  'nav',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'button',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
]);

export function isAllowedTag(tag: string): boolean {
  return ALLOWED_TAGS.has(tag.toLowerCase());
}
