import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { open as openZip, type Entry, type ZipFile } from "yauzl";
import { ifMissing } from "../../../shared/expected-errors.mjs";
import { downloadVerifiedFile } from "../../../shared/verified-download.mjs";
import { ANTIGRAVITY_RELEASE, antigravityAsset, type AntigravityAsset } from "./release.ts";
import { antigravityPaths } from "./paths.ts";

const SETTINGS = {
  downloadTimeoutMs: 60 * 60_000,
};

export interface AntigravityInstallation {
  version: string;
  sha256: string;
  executable: string;
  harness: string;
}

export async function antigravityInstallation(): Promise<AntigravityInstallation | undefined> {
  const raw = await readFile(antigravityPaths.installRecord, "utf8").catch(ifMissing(undefined));
  if (raw === undefined) return undefined;
  const installation = JSON.parse(raw) as AntigravityInstallation;
  for (const path of [installation.executable, installation.harness])
    if (!await stat(path).catch(ifMissing(undefined))) return undefined;
  return installation;
}

function megabytes(bytes: number): number {
  return Math.round(bytes / 1_000_000);
}

function extract(archive: string, destination: string, asset: AntigravityAsset): Promise<void> {
  const expected = new Map([asset.executable, asset.harness].map(file => [file.name, file.bytes]));
  return new Promise((resolve, reject) => {
    openZip(archive, { lazyEntries: true, strictFileNames: true }, (error, zip: ZipFile) => {
      if (error) return reject(error);
      const fail = (failure: Error) => {
        zip.close();
        reject(failure);
      };
      zip.on("error", fail);
      zip.on("end", () => expected.size ? fail(new Error("The Antigravity download is missing files.")) : resolve());
      zip.on("entry", (entry: Entry) => {
        if (expected.get(entry.fileName) !== entry.uncompressedSize)
          return fail(new Error("The Antigravity download has unexpected contents."));
        expected.delete(entry.fileName);
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError);
          pipeline(stream, createWriteStream(join(destination, entry.fileName), { flags: "wx", mode: 0o700 }))
            .then(() => zip.readEntry(), fail);
        });
      });
      zip.readEntry();
    });
  });
}

export async function installAntigravity(progress: (message: string) => void): Promise<AntigravityInstallation> {
  const asset = antigravityAsset();
  const id = `${ANTIGRAVITY_RELEASE.version}-${asset.sha256.slice(0, 12)}`;
  const archive = join(antigravityPaths.downloads, `${id}.zip`);
  const target = join(antigravityPaths.versions, id);
  const staging = `${target}.partial`;
  await mkdir(antigravityPaths.downloads, { recursive: true, mode: 0o700 });
  await mkdir(antigravityPaths.versions, { recursive: true, mode: 0o700 });
  await rm(archive, { force: true });
  await downloadVerifiedFile({
    url: asset.url,
    sha256: asset.sha256,
    maxBytes: asset.bytes,
    timeout: SETTINGS.downloadTimeoutMs,
    label: "Antigravity",
    signal: new AbortController().signal,
    redirect: "follow",
    progress: bytes => progress(`Downloading Antigravity, ${megabytes(bytes)} of ${megabytes(asset.bytes)} MB`),
  }, archive);
  try {
    progress("Unpacking Antigravity");
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { mode: 0o700 });
    await extract(archive, staging, asset);
    if (process.platform !== "win32")
      for (const file of [asset.executable, asset.harness]) await chmod(join(staging, file.name), 0o755);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
  } finally {
    await rm(archive, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
  const installation: AntigravityInstallation = {
    version: ANTIGRAVITY_RELEASE.version,
    sha256: asset.sha256,
    executable: join(target, asset.executable.name),
    harness: join(target, asset.harness.name),
  };
  const record = `${antigravityPaths.installRecord}.partial`;
  await writeFile(record, `${JSON.stringify(installation, null, 2)}\n`, { mode: 0o600 });
  await rename(record, antigravityPaths.installRecord);
  for (const entry of await readdir(antigravityPaths.versions))
    if (entry !== id) await rm(join(antigravityPaths.versions, entry), { recursive: true, force: true });
  return installation;
}
