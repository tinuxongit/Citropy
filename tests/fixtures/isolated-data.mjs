import { after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "citropy-provider-test-"));
process.env.CITROPY_DATA_DIR = directory;

after(async () => {
  const { store } = await import("../../server/store.ts");
  const { eventJournal } = await import("../../server/event-journal.ts");
  store.flush();
  eventJournal.close();
  rmSync(directory, { recursive: true, force: true });
});
