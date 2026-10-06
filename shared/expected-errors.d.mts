export function hasCode(error: unknown, ...codes: string[]): boolean;
export function unlessCode<T>(codes: string[], value: T): (error: unknown) => T;
export function ifMissing<T>(value: T): (error: unknown) => T;
export function logFailure(action: string, ...context: unknown[]): (error: unknown) => void;
