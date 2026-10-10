export interface AntigravityAsset {
  url: string;
  sha256: string;
  bytes: number;
  executable: { name: string; bytes: number };
  harness: { name: string; bytes: number };
}

const DOWNLOADS = "https://dl.google.com/agy-extensions/releases";
const UNIX = { executable: "agy_acp_server.par", harness: "localharness_external" };
const WINDOWS = { executable: "agy_acp_server.exe", harness: "localharness_external.exe" };

export const ANTIGRAVITY_RELEASE = {
  version: "1.3.0",
  assets: {
    "linux-x64": {
      url: `${DOWNLOADS}/linux/agy-acp-server-1.3.0-linux-x86_64.zip`,
      sha256: "9fb60956af0a9d76220a4db91ca9ac88e2a2372ad68f985ab5fceace6b825b96",
      bytes: 333_727_150,
      executable: { name: UNIX.executable, bytes: 926_533_965 },
      harness: { name: UNIX.harness, bytes: 130_388_040 },
    },
    "linux-arm64": {
      url: `${DOWNLOADS}/linux/agy-acp-server-1.3.0-linux-arm64.zip`,
      sha256: "500b0bc0fb858e88f4df404d4cedf80bf9298c178291e39e383d6c50b111cbdf",
      bytes: 321_690_363,
      executable: { name: UNIX.executable, bytes: 930_848_992 },
      harness: { name: UNIX.harness, bytes: 123_224_968 },
    },
    "darwin-arm64": {
      url: `${DOWNLOADS}/macos/agy-acp-server-1.3.0-darwin-arm64.zip`,
      sha256: "7cd97045f7b4fe81175a107cdf16f9c51484e3c78a5162cae415338bb6aa5b88",
      bytes: 111_456_962,
      executable: { name: UNIX.executable, bytes: 278_535_456 },
      harness: { name: UNIX.harness, bytes: 118_611_392 },
    },
    "darwin-x64": {
      url: `${DOWNLOADS}/macos/agy-acp-server-1.3.0-darwin-x86_64.zip`,
      sha256: "bb23956b89984bf5d354af2c3725e6c57f0cc1b7228e77a0e91c9c2bc1d47646",
      bytes: 117_245_544,
      executable: { name: UNIX.executable, bytes: 282_840_688 },
      harness: { name: UNIX.harness, bytes: 124_175_392 },
    },
    "win32-x64": {
      url: `${DOWNLOADS}/windows/agy-acp-server-1.3.0-windows-x86_64.zip`,
      sha256: "65215e0688681fa3116e048a9eab27ef53af1bbd6f3da3f1c52bd4911d8b17f9",
      bytes: 124_509_787,
      executable: { name: WINDOWS.executable, bytes: 81_437_336 },
      harness: { name: WINDOWS.harness, bytes: 145_548_952 },
    },
    "win32-arm64": {
      url: `${DOWNLOADS}/windows/agy-acp-server-1.3.0-windows-arm64.zip`,
      sha256: "4a0f469720e9beb9438a979f543fdbfad5022ebe0992c052c590bd78b3144ca3",
      bytes: 124_654_803,
      executable: { name: WINDOWS.executable, bytes: 85_893_472 },
      harness: { name: WINDOWS.harness, bytes: 135_640_216 },
    },
  } satisfies Record<string, AntigravityAsset>,
};

export function antigravityAsset(platform: string = process.platform, arch: string = process.arch): AntigravityAsset {
  const asset = (ANTIGRAVITY_RELEASE.assets as Record<string, AntigravityAsset>)[`${platform}-${arch}`];
  if (!asset) throw new Error(`Google does not publish Antigravity for ${platform} on ${arch}.`);
  return asset;
}
