import { win32 } from "node:path";

const VERSION = "2.56.0.2";
const RELEASE = "v2.56.0.windows.2";
const BUILDS: Record<string, { suffix: string; sha256: string }> = {
  x64: { suffix: "64-bit", sha256: "da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be" },
  arm64: { suffix: "arm64", sha256: "38b33dc6024026e3315cf88ab2cfea65205bbd7bb3a8e824bd21c8ad4fe609a7" },
};

export function minGitBuild(arch: string): { url: string; sha256: string } | undefined {
  const build = BUILDS[arch];
  if (!build) return undefined;
  return { url: `https://github.com/git-for-windows/git/releases/download/${RELEASE}/MinGit-${VERSION}-${build.suffix}.zip`, sha256: build.sha256 };
}

export function minGitFolder(home: string, arch: string): string {
  return win32.join(home, ".citropy", "runtimes", `mingit-${VERSION}-${arch}`);
}

export function minGitCommands(home: string, arch: string): string {
  return win32.join(minGitFolder(home, arch), "cmd");
}
