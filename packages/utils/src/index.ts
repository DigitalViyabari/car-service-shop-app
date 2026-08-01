export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
export function compact<T>(values: readonly (T | null | undefined)[]): T[] {
  return values.filter((value): value is T => value != null);
}
