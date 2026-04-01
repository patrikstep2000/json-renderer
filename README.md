# json-renderer

React component that renders **site JSON** templates: a recursive `SiteNode` tree with optional `dataBinding` against arbitrary `Record<string, unknown>` view data.

Published package name **`json-renderer`** (see `package.json` `name`). Import paths below use that name; with `npm link` or `"file:../json-renderer"`, the import string stays the same if the consuming app depends on this package under that name.

## Install

```bash
npm install json-renderer
```

Peer dependencies: `react`, `react-dom` (18+ or 19+).

## Public API

- **Default export:** `JsonRenderer` (React component).
- **Also exported:** renderer prop types (`JsonRendererProps`, `JsonDateInputProps`, `JsonSelectInputProps`, `JsonRendererComponents`), site schema types (`SiteJSON`, `SiteNode`, `SitePage`, … from `SiteJSON`), `SITE_JSON_VERSION`, `SITE_VIEWPORT_BREAKPOINTS`, allowlist helpers (`ALLOWED_TAGS`, `isAllowedTag`), and responsive helpers from `responsiveUtils`.

```ts
import JsonRenderer from 'json-renderer';
import type { SiteNode, SiteJSON, JsonRendererProps } from 'json-renderer';
```

## Usage

Minimal example (only required props are `node`, `data`, and `viewportWidth`):

```tsx
import JsonRenderer from 'json-renderer';
import type { SiteNode } from 'json-renderer';

declare const rootSiteNode: SiteNode;

const data: Record<string, unknown> = {
  title: 'Hello',
  blocks: { intro: { text: '…' } },
};

<JsonRenderer
  node={rootSiteNode}
  data={data}
  viewportWidth={typeof window !== 'undefined' ? window.innerWidth : 1024}
/>
```

Optional props you will often use in a full app:

- **`onInternalNavigate`** — called with the **path string** from internal links (`href` starting with `/`, not `//`). Use it for SPA routing instead of full page loads.
- **`mobileMenus` / `setMobileMenus`** — `Record<string, boolean>` keyed by `mobileMenuTarget` / toggle targets from the template (mobile nav patterns).
- **`canRenderNode`** — `(node, data, context) => boolean`. If it returns `false`, that node is skipped (after allowlist and breakpoint checks). Use for feature flags, permissions, or experiments.

```tsx
<JsonRenderer
  node={rootSiteNode}
  data={data}
  viewportWidth={width}
  onInternalNavigate={(path) => router.push(path)}
  mobileMenus={mobileMenus}
  setMobileMenus={setMobileMenus}
  canRenderNode={(node) => node.id !== 'beta-block' || flags.beta}
/>
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

By default, `input[type=date]` and `<select>` from the template are rendered as **native** HTML controls (no extra UI dependencies).

To use your own components (e.g. shadcn `DatePicker` / `Select`), pass `components`:

```tsx
<JsonRenderer
  node={rootSiteNode}
  data={data}
  viewportWidth={width}
  components={{
    DateInput: MyDateInput,
    SelectInput: MySelectInput,
  }}
/>
```

Implementations must match `JsonDateInputProps` and `JsonSelectInputProps` (exported from this package).

## Tailwind CSS

Templates store Tailwind classes as strings. Your app’s Tailwind build must **see** those classes and any utilities used inside the renderer (e.g. `h-12`, `w-full`).

With Tailwind v4, add a source path to this package in your CSS, for example:

```css
@import "tailwindcss";
@source "../node_modules/json-renderer/dist/index.js";
```

Adjust the relative path from your CSS file to the installed package (`node_modules/json-renderer/...` or your linked copy).

## Developing this package

```bash
npm install
npm run build
```

Output is written to `dist/` (`prepublishOnly` runs build before publish).

## License

MIT
