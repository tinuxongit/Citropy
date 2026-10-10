import { downloadVerified } from "./verified-download.mjs";

export const nodeVersion = "22.23.2";
export const nodeChecksums = {
  "linux-x64": "b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a",
  "linux-arm64": "013b59cfd2819703a6f4a14ab891fc46fc2a4e3f5bcd92de3fb4929b43e35b30",
  "darwin-x64": "58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026",
  "darwin-arm64": "61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6",
  "win-x64": "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
  "win-arm64": "fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3",
};

export function nodeArchiveName(platform) {
  return `node-v${nodeVersion}-${platform}.${platform.startsWith("win-") ? "zip" : "tar.gz"}`;
}

export async function downloadNodeArchive(platform, signal) {
  if (!Object.hasOwn(nodeChecksums, platform)) throw new Error("Automatic Node setup supports Linux and macOS, or Windows, on x64 and ARM64.");
  return downloadVerified({
    url: `https://nodejs.org/download/release/v${nodeVersion}/${nodeArchiveName(platform)}`,
    sha256: nodeChecksums[platform],
    maxBytes: 100 * 1024 * 1024,
    timeout: 180000,
    label: "Node.js",
    signal,
    redirect: "error",
  });
}
