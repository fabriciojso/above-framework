# Dependency update verification

The update preserves real Joi 15 (`@hapi/joi` and Above's `Joi` export) and adds Joi 17 (`joi`). Existing consumers do not need an alias or a mandatory Joi migration. The supported runtime floor changes from Node 8.9 to Node 12.0.0; development uses Node 26.13.0.

## Local evidence

- 77 integration cases exercise real Hapi servers, request validation, HTTP contracts and framework features. They include valid/expired/tampered/wrong-algorithm JWTs, both Joi families, pagination, decorators, middleware, errors, health, Swagger, controller discovery, logging and startup/shutdown. Filesystem traversal and malformed multipart regressions also pass.
- Istanbul reports **520/520 lines, 561/561 statements, 141/141 functions and 393/393 branches**: 100% of each metric for executable first-party source. No source exclusions or coverage ignore directives are used. Type-only declarations are checked by compilation.
- A clean consumer outside the repository installs the actual tarball without development dependencies, with strict engine checking, and passes all 77 integration cases. Type fixtures compile with TypeScript 6.0.3 and TypeScript 4.9.5 with Node 12 declarations, using normal package resolution. Assertions reject incorrect types and accidental `any` inference.
- All 12 HTTP fixtures taken from the original example controllers match the pre-update commit `db5af792785710b3f9ba2ada0499c30b53b65161`, comparing response status, body and content type.
- A clean `npm ci --engine-strict`, lint/type checks, documentation generation and GitHub Actions workflow validation pass. TypeDoc reports eight missing-documentation warnings and no errors.

## Security and confidence

The production audit reports **zero known advisories**. The complete tree reports **36 moderate findings and no high or critical findings**, arising from two distinct advisories: npm's bundled glob/minimatch and TypeDoc's compatible minimatch 10 dependency. Root overrides do not replace npm's bundled packages. The fixed minimatch 11 API removes `matchOne()`, which TypeDoc 0.28.20 requires; forcing it breaks documentation generation. These remaining packages are development/release tooling and are not in the published runtime tree.

The packaged runtime dependencies are bundled and transformed to ES2017, including concrete CommonJS subpath resolution for Node 12.0. This increases tarball size and makes packed-artifact verification essential. See [compatibility and maintenance details](compatibility.md).

The tests provide measured confidence in the exercised framework contracts, not an absolute guarantee for unavailable consumer applications. Joi 15 and retired Node versions remain outside upstream maintenance despite functional compatibility. No package is published by this change.

## Exact packed-artifact runtime matrix

Verified at 2026-11-10T03:26:27.405Z. Every runtime performed a clean production installation with its own npm and strict engine checking. The containers mounted only test scripts and artifacts, with no checkout `node_modules` available. All **1,232 integration-case executions** passed.

| Node.js  | Integration cases | Result |
| -------- | ----------------- | ------ |
| 12.0.0   | 77/77             | PASS   |
| 12.22.12 | 77/77             | PASS   |
| 13.14.0  | 77/77             | PASS   |
| 14.21.3  | 77/77             | PASS   |
| 15.14.0  | 77/77             | PASS   |
| 16.20.2  | 77/77             | PASS   |
| 17.9.1   | 77/77             | PASS   |
| 18.20.8  | 77/77             | PASS   |
| 19.9.0   | 77/77             | PASS   |
| 20.20.2  | 77/77             | PASS   |
| 21.7.3   | 77/77             | PASS   |
| 22.23.4  | 77/77             | PASS   |
| 23.11.1  | 77/77             | PASS   |
| 24.22.2  | 77/77             | PASS   |
| 25.9.0   | 77/77             | PASS   |
| 26.13.0  | 77/77             | PASS   |

Tested tarball SHA-1: `c810c08ce0f48d5fbd1943e6ee9bd13bb2a7dc70`. Compressed size: 8548441 bytes.
