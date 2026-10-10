import { createHash } from "node:crypto";

export async function downloadVerified({ url, sha256, maxBytes, timeout, label, signal, redirect }) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]), redirect });
  if (!response.ok || !response.body) throw new Error(`Could not download ${label} (${response.status}). Check this computer's internet connection and retry.`);
  const hash = createHash("sha256");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maxBytes) throw new Error(`The ${label} download exceeded the expected size.`);
    hash.update(chunk);
    chunks.push(chunk);
  }
  if (hash.digest("hex") !== sha256) throw new Error(`The ${label} download failed its integrity check. Nothing was installed; retry the connection.`);
  return Buffer.concat(chunks, length);
}
