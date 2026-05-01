export type TranslationTree = Record<string, unknown>;

const RESULT_NAMESPACE_PATHS = [
  ['common', 'results'],
  ['common', 'metrics'],
  ['scan', 'face'],
  ['scan', 'body'],
  ['scan', 'nutrition'],
  ['scan', 'super'],
  ['verdicts'],
  ['qualitative_levels'],
  ['metric_card'],
  ['condition_card'],
  ['share_story'],
] as const;

function isPlainObject(value: unknown): value is TranslationTree {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function cloneTranslationTree<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTranslationTree(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      cloneTranslationTree(nestedValue),
    ]),
  ) as T;
}

export function mergeTranslationTree(
  target: TranslationTree,
  source: TranslationTree,
) {
  Object.entries(source).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeTranslationTree(target[key] as TranslationTree, value);
      return;
    }

    target[key] = value;
  });
}

export function getNestedTranslationTree(
  source: TranslationTree,
  path: readonly string[],
) {
  return path.reduce<unknown>((current, segment) => {
    if (!isPlainObject(current)) {
      return undefined;
    }

    return current[segment];
  }, source);
}

export function setNestedTranslationTree(
  target: TranslationTree,
  path: readonly string[],
  value: unknown,
) {
  if (path.length === 0) {
    return;
  }

  let currentTarget = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextValue = currentTarget[segment];

    if (!isPlainObject(nextValue)) {
      currentTarget[segment] = {};
    }

    currentTarget = currentTarget[segment] as TranslationTree;
  }

  currentTarget[path[path.length - 1]] = value;
}

export function composeLocaleTranslations(
  baseTranslations: TranslationTree,
  overrideTranslations?: TranslationTree,
) {
  const localeTree = cloneTranslationTree(baseTranslations);

  if (!overrideTranslations) {
    return localeTree;
  }

  mergeTranslationTree(localeTree, overrideTranslations);

  RESULT_NAMESPACE_PATHS.forEach((path) => {
    const authoritativeTree = getNestedTranslationTree(overrideTranslations, path);

    if (typeof authoritativeTree !== 'undefined') {
      setNestedTranslationTree(localeTree, path, authoritativeTree);
    }
  });

  return localeTree;
}
