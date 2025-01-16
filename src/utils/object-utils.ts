export function isObject(item: unknown): item is Record<string, unknown> {
  return Boolean(item && typeof item === 'object' && !Array.isArray(item));
}

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target } as T;
  
  if (!isObject(target) || !isObject(source)) {
    return source as T;
  }

  Object.keys(source).forEach(key => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (isObject(sourceValue)) {
      if (!(key in target)) {
        Object.assign(output, { [key]: sourceValue });
      } else if (isObject(targetValue)) {
        const merged = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
        Object.assign(output, { [key]: merged });
      }
    } else {
      Object.assign(output, { [key]: sourceValue });
    }
  });

  return output;
}

export function getValueByPath<T>(obj: T, path: string[]): unknown {
  return path.reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function setValueByPath<T extends Record<string, any>>(obj: T, path: string[], value: unknown): void {
  const lastKey = path.pop();
  if (!lastKey) return;

  const target = path.reduce((current: Record<string, any>, key: string) => {
    if (!(key in current)) {
      current[key] = {};
    }
    return current[key] as Record<string, any>;
  }, obj);

  target[lastKey] = value;
}
