import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { inside } from "./files.ts";
import { EDITOR_MAX_BYTES, type EditorFile } from "../shared/editor.ts";

const saves = new Map<string, Promise<EditorFile>>();

function revision(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function location(root: string, path: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const requested = inside(canonicalRoot, path);
  if (!requested || requested === canonicalRoot)
    throw new Error("Choose a file inside this workspace.");
  const canonical = await realpath(requested);
  if (
    !inside(canonicalRoot, canonical) ||
    (await lstat(requested)).isSymbolicLink()
  )
    throw new Error(
      "Symbolic links and files outside the workspace cannot be edited.",
    );
  return canonical;
}

async function readBytes(
  path: string,
  expected?: { dev: number; ino: number },
): Promise<Buffer> {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (expected && (info.dev !== expected.dev || info.ino !== expected.ino))
      throw new Error("The file changed while opening. Try again.");
    if (!info.isFile()) throw new Error("Choose a regular text file.");
    if (info.size > EDITOR_MAX_BYTES)
      throw new Error("Editing is limited to files up to 2 MB.");
    const buffer = Buffer.alloc(Math.min(info.size + 1, EDITOR_MAX_BYTES + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > info.size)
      throw new Error("The file changed while reading. Try again.");
    return buffer.subarray(0, length);
  } finally {
    await file.close();
  }
}

function document(bytes: Buffer): EditorFile {
  if (bytes.includes(0)) throw new Error("Binary files cannot be edited.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("Only UTF-8 text files can be edited.");
  }
  return { text, revision: revision(bytes) };
}

export async function readEditorFile(
  root: string,
  path: string,
): Promise<EditorFile> {
  const requested = inside(root, path);
  if (!requested) throw new Error("Choose a file inside this workspace.");
  const expected = await lstat(requested);
  const target = await location(root, path);
  const bytes = await readBytes(target, expected);
  const current = await lstat(await location(root, path));
  if (
    expected.dev !== current.dev ||
    expected.ino !== current.ino ||
    expected.mtimeMs !== current.mtimeMs
  )
    throw new Error("The file changed while reading. Try again.");
  return document(bytes);
}

export async function saveEditorFile(
  root: string,
  path: string,
  text: unknown,
  expected: unknown,
): Promise<EditorFile> {
  if (
    typeof text !== "string" ||
    typeof expected !== "string" ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    throw new Error("Invalid file save request.");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > EDITOR_MAX_BYTES)
    throw new Error("Editing is limited to files up to 2 MB.");
  const result = document(bytes);
  const target = await location(root, path);
  const previous = saves.get(target);
  const operation = (async () => {
    await previous?.catch(() => {});
    const parent = dirname(target);
    const expectedParent = await lstat(parent);
    await location(root, path);
    const directory =
      process.platform === "linux"
        ? await open(parent, constants.O_RDONLY)
        : undefined;
    const base = directory ? `/proc/self/fd/${directory.fd}` : parent;
    const pinned = join(base, basename(target));
    const temporary = join(base, `.citropy-save-${randomUUID()}`);
    try {
      const parentInfo = directory ? await directory.stat() : await lstat(parent);
      if (
        parentInfo.dev !== expectedParent.dev ||
        parentInfo.ino !== expectedParent.ino
      )
        throw new Error("The workspace directory changed. Try again.");
      const expectedFile = await lstat(pinned);
      const current = await readBytes(pinned, expectedFile);
      if (revision(current) !== expected)
        throw new Error(
          "This file changed on disk. Your draft is safe. Reload the file before saving again.",
        );
      const info = expectedFile;
      const file = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        info.mode & 0o777,
      );
      try {
        await file.chmod(info.mode & 0o777);
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      const checked = await location(root, path);
      const currentParent = await lstat(dirname(checked));
      if (
        checked !== target ||
        currentParent.dev !== parentInfo.dev ||
        currentParent.ino !== parentInfo.ino ||
        revision(await readBytes(pinned)) !== expected
      )
        throw new Error(
          "This file changed on disk. Your draft is safe. Reload the file before saving again.",
        );
      await rename(temporary, pinned);
      return result;
    } finally {
      await unlink(temporary).catch(() => {});
      await directory?.close();
    }
  })();
  saves.set(target, operation);
  try {
    return await operation;
  } finally {
    if (saves.get(target) === operation) saves.delete(target);
  }
}

export async function createEditorFile(
  root: string,
  path: string,
): Promise<EditorFile> {
  const canonicalRoot = await realpath(root);
  const requested = inside(canonicalRoot, path);
  if (!requested || requested === canonicalRoot)
    throw new Error("Choose a file inside this workspace.");
  const parent = dirname(requested);
  const expectedParent = await lstat(parent);
  const canonicalParent = await realpath(parent);
  if (!inside(canonicalRoot, canonicalParent))
    throw new Error("Choose a file inside this workspace.");
  const directory =
    process.platform === "linux"
      ? await open(canonicalParent, constants.O_RDONLY)
      : undefined;
  try {
    const info = directory
      ? await directory.stat()
      : await lstat(canonicalParent);
    if (
      !info.isDirectory() ||
      info.dev !== expectedParent.dev ||
      info.ino !== expectedParent.ino
    )
      throw new Error("The workspace directory changed. Try again.");
    const base = directory ? `/proc/self/fd/${directory.fd}` : canonicalParent;
    const file = await open(
      join(base, basename(requested)),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o666,
    );
    await file.close();
    return document(Buffer.alloc(0));
  } finally {
    await directory?.close();
  }
}
