/**
 * Renders a `SiteNode` tree to React/HTML: bindings, repeats, visibility, responsive overrides, forms, and template actions.
 * `data` is never mutated; paths are read via dot notation. Unknown tags are dropped (see `nodeTypes.ts`).
 */
import {
  createElement,
  Fragment,
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import type {
  SiteAction,
  SiteAttributeValue,
  SiteCondition,
  SiteFormValidationMap,
  SiteNode,
  SiteNodeAttributes,
  SitePage,
  SiteJSON,
} from './types';
import { isAllowedTag } from './nodeTypes';
import { isHiddenAtBreakpoint, resolveResponsiveClassName, resolveResponsiveStyles } from './responsiveUtils';

export interface JsonDateInputProps {
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** For custom date pickers (e.g. popover wrapper). */
  popoverClassName?: string;
  calendarClassName?: string;
  name?: string;
  onValueChange?: (value: string) => void;
}

export interface JsonSelectInputProps {
  className?: string;
  options: Array<{ value: string; label: string; className?: string }>;
  disabled?: boolean;
  placeholder?: string;
  contentClassName?: string;
  itemClassName?: string;
  name?: string;
  onValueChange?: (value: string) => void;
}

export interface JsonRendererComponents {
  DateInput?: ComponentType<JsonDateInputProps>;
  SelectInput?: ComponentType<JsonSelectInputProps>;
}

export interface JsonRendererProps {
  /** Full template document. When provided, renderer resolves the current page node automatically. */
  siteJson?: SiteJSON;
  /** Optional explicit page path for `siteJson` mode. Defaults to current location pathname. */
  currentPath?: string;
  /** Backward-compatible direct node rendering mode. */
  node?: SiteNode;
  /** Domain object for `dataBinding` / `repeat` / `visibility` path resolution (any JSON-serializable tree). */
  data: Record<string, unknown>;
  /** Optional viewport override. If omitted, renderer tracks `window.innerWidth` automatically. */
  viewportWidth?: number;
  context?: Record<string, unknown>;
  /**
   * Optional gate for domain-specific rules (e.g. hide a form when a feature flag is off).
   * When provided and returns false, the node is not rendered (after tag/breakpoint checks).
   */
  canRenderNode?: (node: SiteNode, data: Record<string, unknown>, context: Record<string, unknown>) => boolean;
  /** For same-origin paths only: `href` starting with `/` (not `//`). Receives the path string, e.g. `/about`. */
  onInternalNavigate?: (path: string) => void;
  mobileMenus?: Record<string, boolean>;
  setMobileMenus?: Dispatch<SetStateAction<Record<string, boolean>>>;
  formErrors?: Record<string, string | undefined>;
  setFormErrors?: Dispatch<SetStateAction<Record<string, string | undefined>>>;
  formTouched?: Record<string, boolean | undefined>;
  setFormTouched?: Dispatch<SetStateAction<Record<string, boolean | undefined>>>;
  formStates?: Record<string, 'idle' | 'submitting' | 'success' | 'error' | undefined>;
  setFormStates?: Dispatch<SetStateAction<Record<string, 'idle' | 'submitting' | 'success' | 'error' | undefined>>>;
  formMessages?: Record<string, string | undefined>;
  setFormMessages?: Dispatch<SetStateAction<Record<string, string | undefined>>>;
  /** Override date/select UI (defaults to native `<input type="date">` / `<select>`). */
  components?: JsonRendererComponents;
}

function getFormErrorKey(formId: string): string {
  return `form:${formId}`;
}

function getFieldErrorKey(formId: string, fieldName: string): string {
  return `field:${formId}:${fieldName}`;
}

function getFieldTouchedKey(formId: string, fieldName: string): string {
  return `touched:${formId}:${fieldName}`;
}

function getFormStateKey(formId: string): string {
  return `state:${formId}`;
}

function getFormMessageKey(formId: string): string {
  return `message:${formId}`;
}

/** When a form node has no `attributes.id`, validation/state keys use this id—set an explicit form `id` in JSON if you have multiple forms. */
const FALLBACK_FORM_ID = 'default-form';

/** Canonical camelCase names from `SiteNodeNavAttributes` / `SiteNodeFormRendererAttributes`. */
const RENDERER_CONTROL_PROP_NAMES_CAMEL = [
  'navRole',
  'mobileMenuTarget',
  'mobileToggleTarget',
  'closeOnNavigate',
  'datePopoverClassName',
  'dateCalendarClassName',
  'selectContentClassName',
  'selectItemClassName',
  'validationSummaryFor',
  'validationErrorFor',
  'validationAllErrorsFor',
  'formStateFor',
  'formStateIs',
  'formMessageFor',
] as const;

function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function toSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** All spellings editors/serializers might use for the same logical attribute. */
function buildRendererControlPropDenylist(canonical: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const key of canonical) {
    set.add(key);
    set.add(key.toLowerCase());
    set.add(toKebabCase(key));
    set.add(toSnakeCase(key));
  }
  return set;
}

const RENDERER_CONTROL_PROP_KEYS = buildRendererControlPropDenylist(RENDERER_CONTROL_PROP_NAMES_CAMEL);

/**
 * Remove JsonRenderer-only props so they never reach `createElement` / DOM.
 * `data-*` and `aria-*` are kept (legitimate HTML).
 */
function omitTemplateControlProps(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      out[key] = value;
      continue;
    }
    if (!RENDERER_CONTROL_PROP_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

/** Walks `source` by dot-separated segments; missing segments yield `undefined`. */
function resolvePath(path: string, source: unknown): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function normalizePath(path: string): string {
  if (!path) return '/';
  if (path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveNodeFromSiteJson(siteJson: SiteJSON, currentPath: string): SiteNode | null {
  const pages: SitePage[] = Array.isArray(siteJson.pages) ? siteJson.pages : [];
  if (pages.length === 0) return null;

  const normalizedPath = normalizePath(currentPath);
  const matchedPage =
    pages.find((page) => page.slug === normalizedPath) ||
    pages.find((page) => page.slug === '/') ||
    pages[0];

  return matchedPage?.root ?? null;
}

function resolveDataBinding(
  node: SiteNode,
  data: Record<string, unknown>,
  context: Record<string, unknown>
): { textContent?: string; attributes?: SiteNodeAttributes } {
  if (!node.dataBinding) return { textContent: node.textContent };

  const { section, field, type } = node.dataBinding;
  let value: unknown;

  // Dotted field: prefer `context[firstSegment].rest` (repeat/item scope), else resolve full path on `data`.
  if (field.includes('.')) {
    const [root, ...rest] = field.split('.');
    if (root in context) {
      value = resolvePath(rest.join('.'), context[root]);
    } else {
      value = resolvePath(field, data);
    }
  } else if (section === 'root') {
    value = resolvePath(field, data);
  } else {
    value = resolvePath(`${section}.${field}`, data);
  }

  if (type === 'image') {
    return {
      attributes: {
        ...(node.attributes ?? {}),
        src: typeof value === 'string' && value ? value : '',
      },
    };
  }

  return {
    textContent: value == null ? node.textContent : String(value),
    attributes: node.attributes,
  };
}

/** Clone template branch per array element; each item is available in `context` under `itemVariable`. */
function resolveRepeatData(
  node: SiteNode,
  data: Record<string, unknown>,
  context: Record<string, unknown>
): unknown[] {
  if (!node.repeat) return [];
  const { dataSource, where, sortBy, sortDirection, offset, limit } = node.repeat;
  const source = dataSource;
  // Dotted path can read from template + repeat context; plain key reads from `data` only.
  const value = source.includes('.') ? resolvePath(source, { ...data, ...context }) : resolvePath(source, data);
  if (!Array.isArray(value)) return [];

  let result = [...value];
  if (where?.length) {
    result = result.filter((item) =>
      where.every((condition) => evaluateCondition(condition, { ...data, ...context, item }))
    );
  }

  if (sortBy) {
    result.sort((left, right) => {
      const leftValue = resolvePath(sortBy, left);
      const rightValue = resolvePath(sortBy, right);
      const leftComparable = String(leftValue ?? '');
      const rightComparable = String(rightValue ?? '');
      const cmp = leftComparable.localeCompare(rightComparable, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }

  const from = Math.max(0, offset ?? 0);
  const to = limit != null ? from + Math.max(0, limit) : undefined;
  return result.slice(from, to);
}

function asString(value: SiteAttributeValue | undefined): string | undefined {
  if (value == null) return undefined;
  return String(value);
}

function asBoolean(value: SiteAttributeValue | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function isInternalHref(href: SiteAttributeValue | undefined): href is string {
  if (!href) return false;
  if (typeof href !== 'string') return false;
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false;
  return true;
}

function evaluateCondition(condition: SiteCondition, source: Record<string, unknown>): boolean {
  const value = resolvePath(condition.field, source);

  if (condition.exists != null) {
    return condition.exists ? value != null : value == null;
  }

  if (condition.equals !== undefined && value !== condition.equals) return false;
  if (condition.notEquals !== undefined && value === condition.notEquals) return false;
  if (condition.in && !condition.in.includes((value as SiteAttributeValue) ?? null)) return false;
  if (condition.notIn && condition.notIn.includes((value as SiteAttributeValue) ?? null)) return false;
  return true;
}

/**
 * `showWhen` mini-language: empty → true; `!path` → falsy path; `path==value` / `path!=value` (bools, null, numbers, quoted strings); else truthiness of `path`.
 */
function evaluateShowWhen(expression: string, source: Record<string, unknown>): boolean {
  const input = expression.trim();
  if (!input) return true;

  if (input.startsWith('!')) {
    const value = resolvePath(input.slice(1).trim(), source);
    return !value;
  }

  const equalsMatch = input.match(/^(.+?)(==|!=)(.+)$/);
  if (equalsMatch) {
    const [, rawLeft, operator, rawRight] = equalsMatch;
    const leftValue = resolvePath(rawLeft.trim(), source);
    const rightRaw = rawRight.trim();
    const rightValue: SiteAttributeValue =
      rightRaw === 'true'
        ? true
        : rightRaw === 'false'
          ? false
          : rightRaw === 'null'
            ? null
            : Number.isNaN(Number(rightRaw))
              ? rightRaw.replace(/^['"]|['"]$/g, '')
              : Number(rightRaw);
    return operator === '==' ? leftValue === rightValue : leftValue !== rightValue;
  }

  return Boolean(resolvePath(input, source));
}

function validateForm(
  formElement: HTMLFormElement,
  rules: SiteFormValidationMap
): { valid: boolean; message?: string; fieldErrors: Record<string, string> } {
  const formData = new FormData(formElement);
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, rule] of Object.entries(rules)) {
    const input = formElement.elements.namedItem(fieldName);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) {
      continue;
    }

    const raw = formData.get(fieldName);
    const value = typeof raw === 'string' ? raw : '';
    input.setCustomValidity('');

    const messages: string[] = [];

    if (rule.required && !value.trim()) {
      messages.push(rule.message ?? 'This field is required.');
    }
    if (rule.minLength != null && value.length < rule.minLength) {
      messages.push(rule.message ?? `Minimum length is ${rule.minLength}.`);
    }
    if (rule.maxLength != null && value.length > rule.maxLength) {
      messages.push(rule.message ?? `Maximum length is ${rule.maxLength}.`);
    }
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(value)) {
        messages.push(rule.message ?? 'Invalid format.');
      }
    }

    if (messages.length > 0) {
      input.setCustomValidity(messages[0]);
      fieldErrors[fieldName] = messages.join(' ');
    }
  }

  const firstMessage = Object.values(fieldErrors)[0];
  return { valid: Object.keys(fieldErrors).length === 0, message: firstMessage, fieldErrors };
}

function NativeJsonDateInput({
  className,
  placeholder,
  disabled,
  name,
  onValueChange,
}: JsonDateInputProps) {
  const [value, setValue] = useState('');

  return (
    <input
      type="date"
      className={className}
      disabled={disabled}
      name={name}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        onValueChange?.(v);
      }}
      aria-label={placeholder ?? 'Date'}
    />
  );
}

function NativeJsonSelectInput({
  className,
  options,
  disabled,
  placeholder,
  itemClassName,
  name,
  onValueChange,
}: JsonSelectInputProps) {
  const [value, setValue] = useState<string>(options[0]?.value ?? '');

  return (
    <select
      className={className}
      disabled={disabled}
      name={name}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        onValueChange?.(v);
      }}
      aria-label={placeholder ?? 'Select'}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className={option.className ?? itemClassName}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function JsonRenderer({
  siteJson,
  currentPath,
  node: nodeProp,
  data,
  viewportWidth: viewportWidthProp,
  context = {},
  canRenderNode,
  onInternalNavigate: onInternalNavigateProp,
  mobileMenus: mobileMenusProp,
  setMobileMenus: setMobileMenusProp,
  formErrors,
  setFormErrors,
  formTouched,
  setFormTouched,
  formStates,
  setFormStates,
  formMessages,
  setFormMessages,
  components,
}: JsonRendererProps) {
  const [internalViewportWidth, setInternalViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const [internalMobileMenus, setInternalMobileMenus] = useState<Record<string, boolean>>({});
  const [internalPath, setInternalPath] = useState(() =>
    normalizePath(currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/'))
  );

  useEffect(() => {
    if (viewportWidthProp != null) return;
    const onResize = () => setInternalViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [viewportWidthProp]);

  useEffect(() => {
    if (currentPath == null) return;
    setInternalPath(normalizePath(currentPath));
  }, [currentPath]);

  useEffect(() => {
    if (currentPath != null) return;
    if (typeof window === 'undefined') return;
    const onPopState = () => setInternalPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [currentPath]);

  const viewportWidth = viewportWidthProp ?? internalViewportWidth;
  const mobileMenus = mobileMenusProp ?? internalMobileMenus;
  const setMobileMenus = setMobileMenusProp ?? setInternalMobileMenus;
  const effectivePath = currentPath ?? internalPath;
  const node = nodeProp ?? (siteJson ? resolveNodeFromSiteJson(siteJson, effectivePath) : null);

  const onInternalNavigate =
    onInternalNavigateProp ??
    ((path: string) => {
      const normalized = normalizePath(path);
      setInternalPath(normalized);
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', normalized);
      }
    });

  if (!node) return null;

  const [localFormErrors, setLocalFormErrors] = useState<Record<string, string | undefined>>({});
  const [localFormTouched, setLocalFormTouched] = useState<Record<string, boolean | undefined>>({});
  const [localFormStates, setLocalFormStates] = useState<
    Record<string, 'idle' | 'submitting' | 'success' | 'error' | undefined>
  >({});
  const [localFormMessages, setLocalFormMessages] = useState<Record<string, string | undefined>>({});
  const effectiveFormErrors = formErrors ?? localFormErrors;
  const effectiveSetFormErrors = setFormErrors ?? setLocalFormErrors;
  const effectiveFormTouched = formTouched ?? localFormTouched;
  const effectiveSetFormTouched = setFormTouched ?? setLocalFormTouched;
  const effectiveFormStates = formStates ?? localFormStates;
  const effectiveSetFormStates = setFormStates ?? setLocalFormStates;
  const effectiveFormMessages = formMessages ?? localFormMessages;
  const effectiveSetFormMessages = setFormMessages ?? setLocalFormMessages;

  const DateCmp = components?.DateInput ?? NativeJsonDateInput;
  const SelectCmp = components?.SelectInput ?? NativeJsonSelectInput;

  const childRendererProps = {
    data,
    viewportWidth,
    canRenderNode,
    onInternalNavigate,
    mobileMenus,
    setMobileMenus,
    formErrors: effectiveFormErrors,
    setFormErrors: effectiveSetFormErrors,
    formTouched: effectiveFormTouched,
    setFormTouched: effectiveSetFormTouched,
    formStates: effectiveFormStates,
    setFormStates: effectiveSetFormStates,
    formMessages: effectiveFormMessages,
    setFormMessages: effectiveSetFormMessages,
    components,
  };

  if (!isAllowedTag(node.tag)) return null;
  if (isHiddenAtBreakpoint(node.responsive, viewportWidth)) return null;
  if (canRenderNode && !canRenderNode(node, data, context)) return null;
  if (node.visibility) {
    const source = { ...data, ...context };
    const allPass = (node.visibility.all ?? []).every((condition) => evaluateCondition(condition, source));
    const anyPass = node.visibility.any?.length
      ? node.visibility.any.some((condition) => evaluateCondition(condition, source))
      : true;
    const showWhenPass = node.visibility.showWhen ? evaluateShowWhen(node.visibility.showWhen, source) : true;
    if (!allPass || !anyPass || !showWhenPass) return null;
  }

  const resolvedStyle = resolveResponsiveStyles(node.style, node.responsive, viewportWidth);
  const resolved = resolveDataBinding(node, data, context);
  const resolvedAttributes = resolved.attributes ?? node.attributes ?? {};
  const {
    class: htmlClass,
    className: attributeClassName,
    datePopoverClassName,
    dateCalendarClassName,
    selectContentClassName,
    selectItemClassName,
    validationSummaryFor,
    validationErrorFor,
    validationAllErrorsFor,
    formStateFor,
    formStateIs,
    formMessageFor,
    navRole,
    mobileMenuTarget: mobileMenuTargetAttr,
    mobileToggleTarget: mobileToggleTargetAttr,
    closeOnNavigate: closeOnNavigateAttr,
    ...safeAttributes
  } = resolvedAttributes;
  const domAttributes = omitTemplateControlProps(safeAttributes as Record<string, unknown>);
  const mobileMenuTarget = asString(mobileMenuTargetAttr);
  const mobileToggleTarget = asString(mobileToggleTargetAttr);
  const closeOnNavigate = asBoolean(closeOnNavigateAttr);
  const effectiveClassName = resolveResponsiveClassName(
    node.className ?? asString(attributeClassName) ?? asString(htmlClass),
    node.responsive,
    viewportWidth
  );

  const isMobileMenu = navRole === 'mobile-menu' && Boolean(mobileMenuTarget);
  const mobileMenuOpen = isMobileMenu ? Boolean(mobileMenus[mobileMenuTarget!]) : undefined;

  if (node.tag === 'input' && safeAttributes.type === 'date') {
    const formId = asString(context.__currentFormId as SiteAttributeValue) ?? FALLBACK_FORM_ID;
    const fieldName = asString(safeAttributes.name);
    return (
      <DateCmp
        className={effectiveClassName}
        placeholder={asString(safeAttributes.placeholder)}
        disabled={asBoolean(safeAttributes.disabled)}
        popoverClassName={asString(datePopoverClassName)}
        calendarClassName={asString(dateCalendarClassName)}
        name={fieldName}
        onValueChange={() => {
          if (!fieldName) return;
          effectiveSetFormTouched((prev) => ({ ...prev, [getFieldTouchedKey(formId, fieldName)]: true }));
          effectiveSetFormErrors((prev) => ({ ...prev, [getFieldErrorKey(formId, fieldName)]: undefined }));
        }}
      />
    );
  }

  if (node.tag === 'select') {
    const formId = asString(context.__currentFormId as SiteAttributeValue) ?? FALLBACK_FORM_ID;
    const fieldName = asString(safeAttributes.name);
    const options =
      node.children
        ?.filter((child) => child.tag === 'option')
        .map((child) => ({
          value: asString(child.attributes?.value) ?? child.id,
          label: child.textContent ?? asString(child.attributes?.value) ?? 'Option',
          className:
            resolveResponsiveClassName(
              child.className ?? asString(child.attributes?.className) ?? asString(child.attributes?.class),
              child.responsive,
              viewportWidth
            ) ?? undefined,
        })) ?? [];

    return (
      <SelectCmp
        className={effectiveClassName}
        options={options}
        disabled={asBoolean(safeAttributes.disabled)}
        placeholder={asString(safeAttributes.placeholder)}
        contentClassName={asString(selectContentClassName)}
        itemClassName={asString(selectItemClassName)}
        name={fieldName}
        onValueChange={() => {
          if (!fieldName) return;
          effectiveSetFormTouched((prev) => ({ ...prev, [getFieldTouchedKey(formId, fieldName)]: true }));
          effectiveSetFormErrors((prev) => ({ ...prev, [getFieldErrorKey(formId, fieldName)]: undefined }));
        }}
      />
    );
  }

  if (node.repeat) {
    const items = resolveRepeatData(node, data, context);
    return (
      <>
        {items.map((item, index) => (
          <JsonRenderer
            key={`${node.id}-${index}`}
            node={{ ...node, repeat: undefined }}
            context={{ ...context, [node.repeat!.itemVariable]: item }}
            {...childRendererProps}
          />
        ))}
      </>
    );
  }

  const summaryTarget = asString(validationSummaryFor);
  if (summaryTarget) {
    const summaryMessage = effectiveFormErrors[getFormErrorKey(summaryTarget)];
    if (!summaryMessage) return null;
    return createElement(node.tag, { className: effectiveClassName, style: resolvedStyle, ...domAttributes }, summaryMessage);
  }

  const stateTarget = asString(formStateFor);
  const desiredState = asString(formStateIs);
  if (stateTarget && desiredState) {
    const currentState = effectiveFormStates[getFormStateKey(stateTarget)] ?? 'idle';
    if (currentState !== desiredState) return null;
  }

  const formMessageTarget = asString(formMessageFor);
  if (formMessageTarget) {
    const message = effectiveFormMessages[getFormMessageKey(formMessageTarget)];
    if (!message) return null;
    return createElement(node.tag, { className: effectiveClassName, style: resolvedStyle, ...domAttributes }, message);
  }

  const allErrorsTarget = asString(validationAllErrorsFor);
  if (allErrorsTarget) {
    const allErrors = Object.entries(effectiveFormErrors)
      .filter(([key, value]) => key.startsWith(`field:${allErrorsTarget}:`) && value)
      .map(([, value]) => value as string);
    if (allErrors.length === 0) return null;
    return createElement(node.tag, { className: effectiveClassName, style: resolvedStyle, ...domAttributes }, allErrors.join(' | '));
  }

  const fieldErrorTarget = asString(validationErrorFor);
  if (fieldErrorTarget) {
    const formIdForField = asString(context.__currentFormId as SiteAttributeValue) ?? FALLBACK_FORM_ID;
    const fieldError = effectiveFormErrors[getFieldErrorKey(formIdForField, fieldErrorTarget)];
    const touched = Boolean(effectiveFormTouched[getFieldTouchedKey(formIdForField, fieldErrorTarget)]);
    if (!touched) return null;
    if (!fieldError) return null;
    return createElement(node.tag, { className: effectiveClassName, style: resolvedStyle, ...domAttributes }, fieldError);
  }

  const children = [
    resolved.textContent,
    ...(node.children?.map((child) => (
      <Fragment key={child.id}>
        <JsonRenderer
          node={child}
          context={
            node.tag === 'form'
              ? { ...context, __currentFormId: asString(node.attributes?.id) ?? node.id }
              : context
          }
          {...childRendererProps}
        />
      </Fragment>
    )) ?? []),
  ];

  const elementProps: Record<string, unknown> = {
    className: effectiveClassName,
    style: resolvedStyle,
    ...domAttributes,
  };

  if (isMobileMenu) {
    elementProps['data-mobile-menu-open'] = mobileMenuOpen ? 'true' : 'false';
  }

  const fieldName = asString(safeAttributes.name);
  const formId = asString(context.__currentFormId as SiteAttributeValue) ?? FALLBACK_FORM_ID;
  const isNativeField =
    Boolean(fieldName) &&
    (node.tag === 'input' || node.tag === 'textarea') &&
    safeAttributes.type !== 'date';

  if (isNativeField) {
    const prevOnChange = elementProps.onChange as ((event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void) | undefined;
    elementProps.onChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      prevOnChange?.(event);
      if (!fieldName) return;
      effectiveSetFormTouched((prev) => ({ ...prev, [getFieldTouchedKey(formId, fieldName)]: true }));
      effectiveSetFormErrors((prev) => ({ ...prev, [getFieldErrorKey(formId, fieldName)]: undefined }));
    };
  }

  const executeAction = async (action: SiteAction, payload?: Record<string, unknown>, formIdArg?: string) => {
    if (action.type === 'navigate') {
      onInternalNavigate?.(action.to);
      if (action.closeMenuTarget && setMobileMenus) {
        setMobileMenus((prev) => ({ ...prev, [action.closeMenuTarget!]: false }));
      }
      return;
    }

    if (action.type === 'toggle-menu' && setMobileMenus) {
      setMobileMenus((prev) => ({ ...prev, [action.target]: !prev[action.target] }));
      return;
    }

    if (action.type === 'set-menu' && setMobileMenus) {
      setMobileMenus((prev) => ({ ...prev, [action.target]: action.open }));
      return;
    }

    if (action.type === 'submit-webhook') {
      const method = action.method ?? 'POST';
      const includeFormData = action.includeFormData ?? true;
      const response = await fetch(action.url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(action.headers ?? {}),
        },
        body: includeFormData ? JSON.stringify(payload ?? {}) : undefined,
      });

      if (!response.ok) {
        const errorMessage = action.errorMessage ?? `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      if (formIdArg) {
        effectiveSetFormMessages((prev) => ({
          ...prev,
          [getFormMessageKey(formIdArg)]: action.successMessage ?? 'Form submitted successfully.',
        }));
      }
    }
  };

  if (node.events?.onClick) {
    const actions = Array.isArray(node.events.onClick) ? node.events.onClick : [node.events.onClick];
    elementProps.onClick = async (event: ReactMouseEvent) => {
      for (const action of actions) {
        if (action.type === 'navigate') {
          event.preventDefault();
        }
        await executeAction(action);
      }
    };
  }

  if (node.tag === 'form' && node.events?.onSubmit) {
    const actions = Array.isArray(node.events.onSubmit) ? node.events.onSubmit : [node.events.onSubmit];
    const previousOnSubmit = elementProps.onSubmit as ((event: ReactMouseEvent<HTMLFormElement>) => void) | undefined;
    elementProps.onSubmit = async (event: ReactMouseEvent<HTMLFormElement>) => {
      previousOnSubmit?.(event);
      event.preventDefault();

      const formIdLocal = asString(node.attributes?.id) ?? node.id;

      if (node.formValidation) {
        const formElement = event.currentTarget;
        const result = validateForm(formElement, node.formValidation);
        if (!result.valid) {
          effectiveSetFormErrors((prev) => {
            const next = { ...prev };
            next[getFormErrorKey(formIdLocal)] = result.message ?? 'Form is invalid.';
            for (const fieldNameKey of Object.keys(node.formValidation ?? {})) {
              next[getFieldErrorKey(formIdLocal, fieldNameKey)] = undefined;
            }
            for (const [fieldNameKey, message] of Object.entries(result.fieldErrors)) {
              next[getFieldErrorKey(formIdLocal, fieldNameKey)] = message;
            }
            return next;
          });
          effectiveSetFormTouched((prev) => {
            const next = { ...prev };
            for (const fieldNameKey of Object.keys(node.formValidation ?? {})) {
              next[getFieldTouchedKey(formIdLocal, fieldNameKey)] = true;
            }
            return next;
          });
          effectiveSetFormStates((prev) => ({ ...prev, [getFormStateKey(formIdLocal)]: 'error' }));
          effectiveSetFormMessages((prev) => ({
            ...prev,
            [getFormMessageKey(formIdLocal)]: result.message ?? 'Please correct the highlighted fields.',
          }));
          formElement.reportValidity();
          return;
        }
        effectiveSetFormErrors((prev) => {
          const next = { ...prev };
          next[getFormErrorKey(formIdLocal)] = undefined;
          for (const fieldNameKey of Object.keys(node.formValidation ?? {})) {
            next[getFieldErrorKey(formIdLocal, fieldNameKey)] = undefined;
          }
          return next;
        });
      }

      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      effectiveSetFormStates((prev) => ({ ...prev, [getFormStateKey(formIdLocal)]: 'submitting' }));
      effectiveSetFormMessages((prev) => ({ ...prev, [getFormMessageKey(formIdLocal)]: 'Submitting...' }));

      try {
        for (const action of actions) {
          await executeAction(action, payload, formIdLocal);
        }
        effectiveSetFormStates((prev) => ({ ...prev, [getFormStateKey(formIdLocal)]: 'success' }));
        if (!actions.some((action) => action.type === 'submit-webhook')) {
          effectiveSetFormMessages((prev) => ({ ...prev, [getFormMessageKey(formIdLocal)]: 'Submitted successfully.' }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Submission failed.';
        effectiveSetFormStates((prev) => ({ ...prev, [getFormStateKey(formIdLocal)]: 'error' }));
        effectiveSetFormMessages((prev) => ({ ...prev, [getFormMessageKey(formIdLocal)]: message }));
      }
    };
  }

  if (node.tag === 'a' && isInternalHref(safeAttributes.href) && onInternalNavigate) {
    const href = asString(safeAttributes.href);
    const previousOnClick = elementProps.onClick as ((event: ReactMouseEvent) => void) | undefined;
    elementProps.onClick = (event: ReactMouseEvent) => {
      previousOnClick?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (href) onInternalNavigate(href);
      if (closeOnNavigate && mobileMenuTarget && setMobileMenus) {
        setMobileMenus((prev) => ({ ...prev, [mobileMenuTarget]: false }));
      }
    };
  }

  if (mobileToggleTarget && setMobileMenus) {
    const previousOnClick = elementProps.onClick as ((event: ReactMouseEvent) => void) | undefined;
    elementProps.onClick = (event: ReactMouseEvent) => {
      previousOnClick?.(event);
      if (event.defaultPrevented) return;
      setMobileMenus((prev) => ({
        ...prev,
        [mobileToggleTarget]: !prev[mobileToggleTarget],
      }));
    };
  }

  return createElement(
    node.tag,
    omitTemplateControlProps(elementProps as Record<string, unknown>) as Record<string, unknown>,
    ...children
  );
}
