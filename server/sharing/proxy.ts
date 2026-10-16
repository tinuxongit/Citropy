import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { dev, developmentOrigin, port } from "../config.ts";
import {
  authenticate,
  DEVICE_COOKIE,
  redeemPairingCode,
  trackConnection,
  type Route,
} from "./devices.ts";

const SETTINGS = {
  cookieMaxAgeSeconds: 315_360_000,
};

export const DEVICE_HEADER = "x-citropy-device";

const target = new URL(dev ? developmentOrigin : `http://127.0.0.1:${port}`);

export interface DeviceProxy {
  server: Server;
  close(): void;
}

function forwardedHeaders(headers: IncomingHttpHeaders, deviceId: string): IncomingHttpHeaders {
  const result: IncomingHttpHeaders = { ...headers, host: target.host, [DEVICE_HEADER]: deviceId };
  if (result.origin) result.origin = target.origin;
  delete result.referer;
  return result;
}

function page(res: ServerResponse, status: number, message: string): void {
  res
    .writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
    .end(
      `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Citropy</title>` +
        `<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#1e1e1e;color:#e8e8e8;font:16px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">` +
        `<p style="max-width:28ch;line-height:1.5">${message}</p>`,
    );
}

function blockedPath(req: IncomingMessage): boolean {
  return new URL(req.url ?? "/", "http://device").pathname.startsWith("/mcp/");
}

export function createDeviceProxy(route: Route): DeviceProxy {
  const secure = route === "tailscale";
  const upgraded = new Set<Duplex>();

  function pair(code: string | null, req: IncomingMessage, res: ServerResponse): void {
    const token = redeemPairingCode(code, route, req.headers["user-agent"]);
    if (!token) {
      page(
        res,
        403,
        "This pairing code has expired or was already used. Open Phone access in Citropy on your computer and scan the new code.",
      );
      return;
    }
    res
      .writeHead(302, {
        location: "/",
        "cache-control": "no-store",
        "set-cookie": `${DEVICE_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SETTINGS.cookieMaxAgeSeconds}${secure ? "; Secure" : ""}`,
      })
      .end();
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://device");
    if (url.pathname === "/pair") return pair(url.searchParams.get("code"), req, res);
    const device = authenticate(req);
    if (!device)
      return page(
        res,
        401,
        "This device is not paired. Open Phone access in Citropy on your computer and scan the QR code.",
      );
    if (blockedPath(req)) {
      res.writeHead(403).end();
      return;
    }
    trackConnection(device.id, req.socket);
    const upstream = request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: forwardedHeaders(req.headers, device.id),
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    req.pipe(upstream);
  }

  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const device = authenticate(req);
    if (!device || blockedPath(req)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n");
      return;
    }
    const upstream = connect(Number(target.port), target.hostname);
    const close = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on("error", close);
    socket.on("error", close);
    upstream.on("close", close);
    socket.on("close", close);
    trackConnection(device.id, socket);
    upgraded.add(socket);
    socket.once("close", () => upgraded.delete(socket));
    upstream.once("connect", () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(forwardedHeaders(req.headers, device.id)))
        for (const entry of [value].flat())
          if (entry !== undefined) lines.push(`${name}: ${entry}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  }

  const server = createServer(handle);
  server.on("upgrade", upgrade);
  return {
    server,
    close() {
      server.close();
      server.closeAllConnections();
      for (const socket of upgraded) socket.destroy();
      upgraded.clear();
    },
  };
}
