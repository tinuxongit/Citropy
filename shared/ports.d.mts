export function defaultPort(development?: boolean): number;
export function portAvailable(port: number): Promise<boolean>;
export function freePort(): Promise<number>;
