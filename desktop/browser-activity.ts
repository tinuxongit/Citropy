import { logFailure } from "../shared/expected-errors.mjs";

export function browserActivity(
  render: (rendering: boolean) => void,
  activate: (focused: boolean) => unknown,
) {
  let presented = false;
  let rendering = false;
  let operations = 0;
  let idle: NodeJS.Timeout | undefined;
  let disposed = false;
  let focused = false;
  let activation: Promise<unknown> = Promise.resolve();
  const focus = (value: boolean) => {
    if (value === focused) return activation;
    focused = value;
    activation = activation
      .catch(() => {})
      .then(() => {
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
    present(value: boolean) {
      presented = value;
      update();
    },
    reattached() {
      focused = false;
      update();
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
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
