declare module 'lru-cache' {
  interface LRUOptions<K = any, V = any> {
    max?: number;
    ttl?: number;
    maxSize?: number;
    sizeCalculation?: (value: V, key: K) => number;
    dispose?: (value: V, key: K) => void;
    noDisposeOnSet?: boolean;
    updateAgeOnGet?: boolean;
    updateAgeOnHas?: boolean;
  }

  class LRU<K = any, V = any> {
    constructor(options?: number | LRUOptions<K, V>);
    set(key: K, value: V, maxAge?: number): boolean;
    get(key: K): V | undefined;
    peek(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    keys(): K[];
    values(): V[];
    entries(): Array<[K, V]>;
    forEach(callbackFn: (value: V, key: K, cache: this) => void): void;
    load(arr: Array<[K, V]>): void;
    dump(): Array<[K, V]>;
    reset(): void;
    size: number;
    max: number;
  }

  export = LRU;
}
