export function hasCode(error, ...codes) {
  return codes.includes(error?.code ?? "");
}

export function unlessCode(codes, value) {
  return (error) => {
    if (hasCode(error, ...codes)) return value;
    throw error;
  };
}

export function ifMissing(value) {
  return unlessCode(["ENOENT"], value);
}

export function logFailure(action, ...context) {
  return (error) => console.error(`${action} failed:`, ...context, error);
}
