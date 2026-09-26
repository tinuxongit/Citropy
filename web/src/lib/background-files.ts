import { useEffect, useState } from "react";
import { reportError } from "./api.ts";

export type BackgroundFileKind = "image";

const DATABASE = "citropy-backgrounds";
const STORE = "files";
const listeners = new Set<(kind: BackgroundFileKind) => void>();

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close()) as Promise<T>;
}

export function loadBackgroundFile(kind: BackgroundFileKind): Promise<Blob | undefined> {
  return transact("readonly", (store) => store.get(kind) as IDBRequest<Blob | undefined>);
}

export async function saveBackgroundFile(kind: BackgroundFileKind, file: Blob): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image or GIF file.");
  await transact("readwrite", (store) => store.put(file, kind));
  for (const listener of listeners) listener(kind);
}

export function onBackgroundFileChange(listener: (kind: BackgroundFileKind) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBackgroundFile(kind: BackgroundFileKind): Blob | undefined {
  const [file, setFile] = useState<Blob>();
  useEffect(() => {
    let live = true;
    const load = () => void loadBackgroundFile(kind).then((next) => live && setFile(next)).catch(reportError);
    load();
    const stop = onBackgroundFileChange((changed) => { if (changed === kind) load(); });
    return () => { live = false; stop(); };
  }, [kind]);
  return file;
}
