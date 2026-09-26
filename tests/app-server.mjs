import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function startAppServer() {
  const server = await createServer({
    configFile: false,
    root,
    cacheDir: fileURLToPath(new URL("../node_modules/.vite-tests", import.meta.url)),
    plugins: [react()],
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

export async function appServer() {
  const shared = process.env.CITROPY_TEST_APP_URL;
  if (shared) return { url: shared, close: async () => {} };
  return startAppServer();
}
