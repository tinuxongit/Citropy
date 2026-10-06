const TIMEOUT_MS = 2000;
const INTERVAL_MS = 50;

export async function waitUntil(check) {
  for (let waited = 0; !check() && waited < TIMEOUT_MS; waited += INTERVAL_MS)
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
}
