import * as routines from "../routines/routine-store.ts";
import { runRoutine } from "../routines/scheduler.ts";
import type { Routes } from "./types.ts";

export const routineRoutes: Routes = {
  "routine.save": (event, send) => {
    const routine = routines.save(event.threadId, event.routine);
    send({ t: "routine.saved", requestId: event.requestId, id: routine.id });
  },
  "routine.remove": (event) => routines.remove(event.threadId, event.id),
  "routine.run": (event) => runRoutine(event.threadId, event.id, true),
};
