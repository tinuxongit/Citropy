import { hasCode } from "./expected-errors.mjs";

export function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, "EPERM")) return true;
    if (hasCode(error, "ESRCH")) return false;
    throw error;
  }
}
