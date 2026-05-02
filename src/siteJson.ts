// Site JSON document (SiteJSON) — full template typing.
//
// JsonRenderer maps nodes to HTML; input[type=date] and select use native controls
// by default, or optional custom components via JsonRenderer `components` prop.

export interface FontDefinition {
  family: string;
  weights: string[];
  url: string;
}

export interface SiteMeta {
  title: string;
  description: string;
  favicon: string | null;
  fonts: FontDefinition[];
}

export interface GlobalStyles {
  bodyBackground: string;
  bodyColor: string;
  bodyFontFamily: string;
  bodyFontSize: string;
  bodyLineHeight: string;
  linkColor: string;
  linkHoverColor: string;
}

/** Schema version string stored in JSON and validated on import. */
export const SITE_JSON_VERSION = '1.0' as const;
export type SiteJSONVersion = typeof SITE_JSON_VERSION;

/**
 * Breakpoint keys used by responsiveUtils (viewport width in px):
 * - mobile: max 767
 * - tablet: 768–1024
 * - desktop: min 1025
 */
export const SITE_VIEWPORT_BREAKPOINTS = {
  mobile: { maxWidth: 767 },
  tablet: { minWidth: 768, maxWidth: 1024 },
  desktop: { minWidth: 1025 },
} as const;

export type SiteBreakpoint = keyof typeof SITE_VIEWPORT_BREAKPOINTS;

/**
 * Binding section for `dataBinding`: `root` reads `field` from the root of `data`; any other value
 * resolves `section.field` (dot path under `data`).
 */
export type SiteDataBindingSection = 'root' | (string & {});

export type SitePrimitive = string | number | boolean | null;
export type SiteAttributeValue = SitePrimitive;

export interface SiteNodeBinding {
  section: SiteDataBindingSection;
  field: string;
  type: 'text' | 'image' | 'link' | 'list';
}

export interface SiteNodeRepeat {
  /** Dot path to an array on `data`, or on `{ ...data, ...context }` if the path contains `.` */
  dataSource: string;
  /** Name injected into `context` for each list item (child nodes may bind under this key). */
  itemVariable: string;
  where?: SiteCondition[];
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface SiteCondition {
  /** Dot path evaluated on the current source object (repeat items include root fields merged with `item`). */
  field: string;
  equals?: SitePrimitive;
  notEquals?: SitePrimitive;
  in?: SitePrimitive[];
  notIn?: SitePrimitive[];
  exists?: boolean;
}

export interface SiteNodeVisibility {
  all?: SiteCondition[];
  any?: SiteCondition[];
  /** Expression on `{ ...data, ...context }`: `!path`, `a==b` / `a!=b`, or truthy path (README). */
  showWhen?: string;
}

export interface SiteFormValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
}

export type SiteFormValidationMap = Record<string, SiteFormValidationRule>;

export interface SiteNodeResponsiveOverride {
  style?: Record<string, string>;
  className?: string;
  hidden?: boolean;
}

export type SiteNodeResponsive = Partial<Record<SiteBreakpoint, SiteNodeResponsiveOverride>>;

/** Virtual attributes (not DOM): must stay in sync with `RENDERER_CONTROL_PROP_NAMES_CAMEL` in `JsonRenderer.tsx`. */
export interface SiteNodeNavAttributes {
  navRole?: 'mobile-menu' | 'desktop-menu' | 'nav-toggle';
  mobileMenuTarget?: string;
  mobileToggleTarget?: string;
  closeOnNavigate?: 'true' | 'false';
}

/** Virtual attributes (not DOM); also list names in `RENDERER_CONTROL_PROP_NAMES_CAMEL` in `JsonRenderer.tsx`. */
export interface SiteNodeFormRendererAttributes {
  datePopoverClassName?: string;
  dateCalendarClassName?: string;
  selectContentClassName?: string;
  selectItemClassName?: string;
  validationErrorFor?: string;
  validationAllErrorsFor?: string;
  formStateFor?: string;
  formStateIs?: 'idle' | 'submitting' | 'success' | 'error';
  formMessageFor?: string;
}

export interface SiteNodeAttributes extends SiteNodeNavAttributes, SiteNodeFormRendererAttributes {
  [key: string]: SiteAttributeValue | undefined;
}

export type SiteAction =
  | {
      type: 'navigate';
      to: string;
      closeMenuTarget?: string;
    }
  | {
      type: 'toggle-menu';
      target: string;
    }
  | {
      type: 'set-menu';
      target: string;
      open: boolean;
    }
  | {
      type: 'submit-webhook';
      url: string;
      method?: 'POST' | 'PUT' | 'PATCH';
      headers?: Record<string, string>;
      includeFormData?: boolean;
      successMessage?: string;
      errorMessage?: string;
    };

export interface SiteNodeEvents {
  onClick?: SiteAction | SiteAction[];
  onSubmit?: SiteAction | SiteAction[];
}

/** One node in the template tree; maps to an HTML element or a repeat/list expansion. */
export interface SiteNode {
  id: string;
  /** Lowercase HTML tag name; must be in `ALLOWED_TAGS` or the node is skipped. */
  tag: string;
  style: Record<string, string>;
  attributes?: SiteNodeAttributes;
  className?: string;
  textContent?: string;
  children?: SiteNode[];
  dataBinding?: SiteNodeBinding;
  responsive?: SiteNodeResponsive;
  repeat?: SiteNodeRepeat;
  visibility?: SiteNodeVisibility;
  events?: SiteNodeEvents;
  formValidation?: SiteFormValidationMap;
}

export interface SitePage {
  id: string;
  name: string;
  slug: string;
  title?: string;
  isHome?: boolean;
  root: SiteNode;
}

export interface SiteJSON {
  version: SiteJSONVersion;
  /** Identifier for the template's static CSS bundle (e.g. "bistro" → /templates/bistro.css). */
  templateId?: string;
  /** Optional embedded CSS injected as a <style> tag at render time. Sanitized by sanitizeSiteCss before rendering. */
  css?: string;
  meta: SiteMeta;
  globalStyles: GlobalStyles;
  pages: SitePage[];
}

export type SiteJSONDraft = Omit<SiteJSON, 'version'> & { version?: SiteJSONVersion };

const CSS_DANGEROUS_TOKEN_RE = /<\s*\/?\s*(?:style|script)/gi;
const CSS_JS_SCHEME_RE = /javascript\s*:/gi;
const CSS_EXPRESSION_RE = /expression\s*\(/gi;
const CSS_IMPORT_RE = /@import\s+([^;]+);?/gi;
const CSS_DECLARATION_WITH_URL_RE = /([A-Za-z-]+)\s*:\s*([^;{}]*url\([^;{}]*\)[^;{}]*)(;?)/gi;
const CSS_URL_IN_DECLARATION_RE = /url\(\s*([^)]*?)\s*\)/gi;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function isAllowedCssUrl(rawValue: string): boolean {
  const normalized = stripWrappingQuotes(rawValue.trim()).toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('https://')) return true;
  if (normalized.startsWith('data:image/')) return true;
  if (normalized.startsWith('/')) return true;
  if (normalized.startsWith('./') || normalized.startsWith('../')) return true;
  if (normalized.startsWith('#')) return true;
  if (normalized.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  return true;
}

/**
 * Defense-in-depth sanitizer for tenant-authored embedded CSS.
 * Not a full parser: strips obvious style/script escapes and external URL exfil vectors.
 */
export function sanitizeSiteCss(input: string): string {
  let cleaned = input;

  cleaned = cleaned.replace(CSS_DANGEROUS_TOKEN_RE, '');
  cleaned = cleaned.replace(CSS_JS_SCHEME_RE, '');
  cleaned = cleaned.replace(CSS_EXPRESSION_RE, '');

  cleaned = cleaned.replace(CSS_IMPORT_RE, (fullMatch, importTarget: string) => {
    const httpsDirect =
      /^\s*(['"])https:\/\/.+\1\s*$/i.test(importTarget) ||
      /^\s*url\(\s*(['"])https:\/\/.+\1\s*\)\s*$/i.test(importTarget) ||
      /^\s*url\(\s*https:\/\/[^)"'\s][^)]*\)\s*$/i.test(importTarget);
    return httpsDirect ? fullMatch : '';
  });

  cleaned = cleaned.replace(CSS_DECLARATION_WITH_URL_RE, (fullMatch, _propName, declarationValue, semicolon) => {
    CSS_URL_IN_DECLARATION_RE.lastIndex = 0;
    let urlMatch: RegExpExecArray | null = CSS_URL_IN_DECLARATION_RE.exec(declarationValue);
    while (urlMatch) {
      if (!isAllowedCssUrl(urlMatch[1] ?? '')) {
        return '';
      }
      urlMatch = CSS_URL_IN_DECLARATION_RE.exec(declarationValue);
    }
    return `${fullMatch.replace(/\s*;?$/, '')}${semicolon || ';'}`;
  });

  return cleaned;
}
