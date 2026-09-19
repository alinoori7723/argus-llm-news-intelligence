import type { AppendOnlyPersistenceStore } from './types';

export const FORBIDDEN_MUTATION_METHODS: readonly string[] = [
  'update',
  'delete',
  'remove',
  'replace',
  'upsert',
  'mutate',
  'patch',
  'clear',
  'truncate',
  'reset',
];

export type AllowedStoreMethod = 'append' | 'appendBatch' | 'readStream' | 'readAll' | 'snapshot';

type StoreKeysAreAllowed = keyof AppendOnlyPersistenceStore extends AllowedStoreMethod
  ? true
  : never;
export const APPEND_ONLY_CONTRACT_IS_CLOSED: StoreKeysAreAllowed = true;

const reachableNames = (target: object): Set<string> => {
  const names = new Set<string>();
  let cur: object | null = target;
  while (cur && cur !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(cur)) names.add(key);
    cur = Object.getPrototypeOf(cur) as object | null;
  }
  return names;
};

export const findMutationMethods = (target: object): string[] => {
  const names = reachableNames(target);
  return FORBIDDEN_MUTATION_METHODS.filter((name) => names.has(name));
};

export const isAppendOnly = (target: object): boolean => findMutationMethods(target).length === 0;
