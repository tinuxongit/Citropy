import { createServer } from "node:net";

const PORT = 4177;
const DEVELOPMENT_PORT = 4178;
const HOST = "127.0.0.1";

export function defaultPort(development = false) {
  return development ? DEVELOPMENT_PORT : PORT;
}

export function portAvailable(port) {
  return new Promise(resolve => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, HOST, () => probe.close(() => resolve(true)));
  });
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
