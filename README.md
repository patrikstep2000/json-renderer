# @patrikstep/json-renderer

React component that renders **site JSON** templates: a recursive `SiteNode` tree with optional `dataBinding` against arbitrary `Record<string, unknown>` view data.

**npm package:** [`@patrikstep/json-renderer`](https://www.npmjs.com/package/@patrikstep/json-renderer) (see `package.json` `name`). Use this scoped name in imports; with `npm link` or a `file:` dependency, the import string matches what you list under `dependencies`.

## Install

```bash
npm install @patrikstep/json-renderer
```

Peer dependencies: `react`, `react-dom` (18+ or 19+).

## Public API

- **Default export:** `JsonRenderer` (React component).
- **Also exported:** renderer prop types (`JsonRendererProps`, `JsonDateInputProps`, `JsonSelectInputProps`, `JsonRendererComponents`), site schema types (`SiteJSON`, `SiteNode`, `SitePage`, …), `SITE_JSON_VERSION`, `SITE_VIEWPORT_BREAKPOINTS`, allowlist helpers (`ALLOWED_TAGS`, `isAllowedTag`), and responsive helpers from `responsiveUtils`.

```ts
import JsonRenderer from '@patrikstep/json-renderer';
import type { SiteNode, SiteJSON, JsonRendererProps } from '@patrikstep/json-renderer';
```

## Usage

Minimal example (default mode: only `siteJson` + `data` are required):

```tsx
import JsonRenderer from '@patrikstep/json-renderer';
import type { SiteJSON } from '@patrikstep/json-renderer';

declare const siteJson: SiteJSON;

const data: Record<string, unknown> = {
  title: 'Hello',
  blocks: { intro: { text: '…' } },
};

<JsonRenderer
  siteJson={siteJson}
  data={data}
/>
```

By default the renderer:

- resolves the current page from `siteJson.pages` using `window.location.pathname` (fallback `/`, then first page),
- tracks `viewportWidth` internally with `window.innerWidth`,
- keeps internal mobile menu state,
- navigates internal links using browser history (`pushState`).

Optional props you will often use in a full app:

- **`onInternalNavigate`** — called with the **path string** from internal links (`href` starting with `/`, not `//`). Use it for SPA routing instead of full page loads.
- **`mobileMenus` / `setMobileMenus`** — `Record<string, boolean>` keyed by `mobileMenuTarget` / toggle targets from the template (mobile nav patterns).
- **`canRenderNode`** — `(node, data, context) => boolean`. If it returns `false`, that node is skipped (after allowlist and breakpoint checks). Use for feature flags, permissions, or experiments.

```tsx
<JsonRenderer
  siteJson={siteJson}
  data={data}
  currentPath={pathFromRouter}
  viewportWidth={width}
  onInternalNavigate={(path) => router.push(path)}
  mobileMenus={mobileMenus}
  setMobileMenus={setMobileMenus}
  canRenderNode={(node) => node.id !== 'beta-block' || flags.beta}
/>
```

### Backward compatibility (`node` mode)

You can still render a specific node directly:

```tsx
<JsonRenderer node={rootNode} data={data} />
```

### Data binding (`dataBinding`)

Resolution rules (see also `SiteDataBindingSection` in the typings):

| `section` | Effect |
|-----------|--------|
| **`root`** | Reads `field` from the root of `data` (dot path allowed, e.g. `meta.title`). |
| **Any other string** | Reads `section.field` under `data` (e.g. section `blocks`, field `intro.text` → `data.blocks.intro.text`). |

If `field` contains a dot and the first segment is a key on **`context`** (from `repeat` or your own `context` prop), the value is read from that context branch; otherwise paths are resolved on `data`.

### Lists (`repeat`)

`repeat.dataSource` is a dot path. If it contains `.`, it is resolved on a merged `{ ...data, ...context }`; otherwise on `data` only. Each item is exposed under `repeat.itemVariable` in `context` for child nodes.

### Visibility (`visibility`)

Conditions use dot paths on `{ ...data, ...context }`. `showWhen` supports: empty (always show), `!some.path`, `some.path==value` or `!=` (booleans `true`/`false`, `null`, numbers, or quoted strings), or a single path that must be truthy.

### Forms and validation UI

Set a real **`id`** on `<form>` nodes in your JSON when you use validation summary / field error / state attributes (`validationErrorFor`, `formStateFor`, …). If the form has no `id`, the renderer falls back to an internal id **`default-form`** for those state keys—prefer an explicit `id` so multiple forms never clash.

Lifted form state (`formErrors`, `setFormErrors`, …) is optional; if omitted, the renderer keeps local state.

### Date and select fields

By default, `input[type=date]` and `<select>` from the template are rendered as built-in controls from the package.

To use your own components (e.g. shadcn `DatePicker` / `Select`), pass `components`:

```tsx
<JsonRenderer
  siteJson={siteJson}
  data={data}
  components={{
    DateInput: MyDateInput,
    SelectInput: MySelectInput,
  }}
/>
```

Implementations must match `JsonDateInputProps` and `JsonSelectInputProps` (exported from this package).

## Styling

The renderer is style-agnostic. Each `SiteNode` may carry a `className` string and/or a `style` object; the renderer passes both straight to the rendered element. Templates ship their CSS as static stylesheets — set `siteJson.templateId` and serve the matching `<id>.css` from your app's static assets.

Mobile menus use the `data-mobile-menu-open="true|false"` attribute (set automatically by the renderer when `navRole: "mobile-menu"`); the template CSS controls open/closed visibility.

## Developing this package

```bash
npm install
npm run build
```

Output is written to `dist/` (`prepublishOnly` runs build before publish).

## License

MIT
