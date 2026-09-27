export const env = new Proxy(process.env, {
  get(target, key) {
    if (typeof key !== 'string') return undefined;
    return target[key];
  },
});
