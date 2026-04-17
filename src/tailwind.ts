const DEFAULT_CLASS_KEYS = ['tailwindClassName', 'openClass', 'closedClass', 'className'] as const;

export interface TailwindExtractionOptions {
  classKeys?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pushClasses(target: Set<string>, value: string): void {
  for (const className of value.split(/\s+/)) {
    const normalized = className.trim();
    if (normalized.length > 0) {
      target.add(normalized);
    }
  }
}

function visitNode(
  node: unknown,
  classKeys: Set<string>,
  classes: Set<string>,
  visited: WeakSet<object>,
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      visitNode(item, classKeys, classes, visited);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  if (visited.has(node)) {
    return;
  }
  visited.add(node);

  for (const [key, value] of Object.entries(node)) {
    if (classKeys.has(key) && typeof value === 'string') {
      pushClasses(classes, value);
      continue;
    }

    visitNode(value, classKeys, classes, visited);
  }
}

export function extractTailwindClassesFromTemplateJson(
  templateJson: unknown,
  options: TailwindExtractionOptions = {},
): string[] {
  const classes = new Set<string>();
  const classKeys = new Set(options.classKeys ?? DEFAULT_CLASS_KEYS);

  visitNode(templateJson, classKeys, classes, new WeakSet<object>());

  return Array.from(classes).sort((left, right) => left.localeCompare(right));
}

export function extractTailwindClassesFromTemplateJsonList(
  templateJsonList: readonly unknown[],
  options: TailwindExtractionOptions = {},
): string[] {
  const classes = new Set<string>();

  for (const templateJson of templateJsonList) {
    for (const className of extractTailwindClassesFromTemplateJson(templateJson, options)) {
      classes.add(className);
    }
  }

  return Array.from(classes).sort((left, right) => left.localeCompare(right));
}

export function serializeTailwindSafelist(classNames: Iterable<string>): string {
  const normalized = Array.from(classNames)
    .map((className) => className.trim())
    .filter((className) => className.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return normalized.join('\n');
}

export function buildTailwindSafelistFromTemplateJsonList(
  templateJsonList: readonly unknown[],
  options: TailwindExtractionOptions = {},
): string {
  return serializeTailwindSafelist(extractTailwindClassesFromTemplateJsonList(templateJsonList, options));
}
