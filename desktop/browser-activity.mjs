import { logFailure } from "../shared/expected-errors.mjs";

export function browserActivity(render, activate) {
  let presented = false;
  let rendering = false;
  let operations = 0;
  let idle;
  let disposed = false;
  let focused = false;
  let activation = Promise.resolve();
  const focus = value => {
    if (value === focused) return activation;
    focused = value;
    activation = activation.catch(() => {}).then(() => {
      if (!disposed) return activate(value);
    });
    return activation;
  };
  const update = () => {
    if (disposed) return;
    const needed = presented || operations > 0 || idle !== undefined;
    if (needed !== rendering) {
      rendering = needed;
      render(needed);
    }
    void focus(needed).catch(logFailure("Changing browser tab focus"));
  };
  return {
    get rendering() {
      return rendering;
    },
    present(value) {
      presented = value;
      update();
    },
    reattached() {
      focused = false;
      update();
    },
    async run(operation) {
      if (disposed) throw new Error("This browser tab is closed");
      clearTimeout(idle);
      idle = undefined;
      operations++;
      try {
        update();
        await activation;
        if (disposed) throw new Error("This browser tab is closed");
        return await operation();
      } finally {
        operations--;
        if (!disposed && operations === 0) {
          idle = setTimeout(() => {
            idle = undefined;
            update();
          }, 30_000);
          idle.unref();
        }
        update();
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(idle);
      idle = undefined;
    },
  };
}
