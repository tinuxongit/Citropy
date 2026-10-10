import { createHash } from "node:crypto";
import { open, rm } from "node:fs/promises";

async function verifiedChunks({ url, sha256, maxBytes, timeout, label, signal, redirect, progress }, write) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]), redirect });
  if (!response.ok || !response.body) throw new Error(`Could not download ${label} (${response.status}). Check this computer's internet connection and retry.`);
  const hash = createHash("sha256");
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maxBytes) throw new Error(`The ${label} download exceeded the expected size.`);
    hash.update(chunk);
    await write(chunk);
    progress?.(length);
  }
  if (hash.digest("hex") !== sha256) throw new Error(`The ${label} download failed its integrity check. Nothing was installed; retry the connection.`);
}

export async function downloadVerified(options) {
  const chunks = [];
  let length = 0;
  await verifiedChunks(options, chunk => {
    chunks.push(chunk);
    length += chunk.length;
  });
  return Buffer.concat(chunks, length);
}

export async function downloadVerifiedFile(options, path) {
  try {
    const file = await open(path, "wx", 0o600);
    try {
      await verifiedChunks(options, chunk => file.write(chunk));
    } finally {
      await file.close();
    }
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}
