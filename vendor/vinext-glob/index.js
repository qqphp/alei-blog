import * as tinyglobby from 'tinyglobby';

// vite-plugin-dynamic-import 1.6.0 only calls fast-glob.sync(patterns, { cwd }).
const glob = {
  sync(patterns, options) {
    return tinyglobby.globSync(patterns, options);
  },
};
export default glob;
