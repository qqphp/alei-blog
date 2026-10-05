# Vinext dependency compatibility

The override is limited to `vite-plugin-dynamic-import` 1.6.0, whose only use of
`fast-glob` is `sync(patterns, { cwd })`. This adapter uses pinned `tinyglobby`
instead, removing the dependency on the unpatched recursive parser in `braces`
([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
It does not implement the full fast-glob API. Check the consumer's API calls when
upgrading that plugin; `npm run test:dependencies` covers its required matching
behavior.

Vinext 1.0.1 also embeds image-size 2.0.2 outside the npm dependency graph. The
root `postinstall` script redirects that embedded parser to the pinned, patched
image-size 2.0.4 package, and removes Vinext's optional Sharp type stub so that
the installed Sharp package supplies its own types. Run a normal `npm ci` with
lifecycle scripts enabled.
The same dependency test verifies the redirect. Remove this patch when upgrading
to a Vinext version that embeds a fixed parser.
