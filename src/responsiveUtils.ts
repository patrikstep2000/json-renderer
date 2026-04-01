import type { SiteNode } from './siteJson';

/** Must stay in sync with `SITE_VIEWPORT_BREAKPOINTS` in `siteJson.ts` (same px boundaries). */
const BREAKPOINTS = {
  mobile: { maxWidth: 767 },
  tablet: { minWidth: 768, maxWidth: 1024 },
  desktop: { minWidth: 1025 },
} as const;

function getBreakpoint(viewportWidth: number): keyof typeof BREAKPOINTS {
  if (viewportWidth <= BREAKPOINTS.mobile.maxWidth) return 'mobile';
  if (viewportWidth <= BREAKPOINTS.tablet.maxWidth) return 'tablet';
  return 'desktop';
}

export function resolveResponsiveStyles(
  style: Record<string, string>,
  responsive: SiteNode['responsive'],
  viewportWidth: number
): Record<string, string> {
  const breakpoint = getBreakpoint(viewportWidth);
  const override = responsive?.[breakpoint]?.style ?? {};
  return { ...style, ...override };
}

function compactClasses(...values: Array<string | undefined>): string | undefined {
  const className = values
    .flatMap((value) => (value ?? '').split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');

  return className || undefined;
}

export function resolveResponsiveClassName(
  className: string | undefined,
  tailwindClassName: string | undefined,
  responsive: SiteNode['responsive'],
  viewportWidth: number
): string | undefined {
  const breakpoint = getBreakpoint(viewportWidth);
  const responsiveClassName = responsive?.[breakpoint]?.className;
  const responsiveTailwind = responsive?.[breakpoint]?.tailwindClassName;

  return compactClasses(className, tailwindClassName, responsiveClassName, responsiveTailwind);
}

export function isHiddenAtBreakpoint(
  responsive: SiteNode['responsive'],
  viewportWidth: number
): boolean {
  const breakpoint = getBreakpoint(viewportWidth);
  return Boolean(responsive?.[breakpoint]?.hidden);
}
