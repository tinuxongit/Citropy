export function memoizeAsync<Key, Value>(load: (key: Key) => Promise<Value>): (key: Key) => Promise<Value> {
  const results = new Map<Key, Promise<Value>>();
  return (key) => {
    let result = results.get(key);
    if (!result) {
      result = load(key).catch((error) => {
        results.delete(key);
        throw error;
      });
      results.set(key, result);
    }
    return result;
  };
}
