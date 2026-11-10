# Dependency update and compatibility

The runtime remains CommonJS and supports Node.js **12.0.0 and later**. Development, compilation, documentation and coverage use Node **26.13.0**, selected by `.nvmrc`. Node 8.9 is not supported: security updates such as jsonwebtoken 9 require Node 12 or later.

## Joi 15 and Joi 17 coexist

Existing consumers can keep `import Joi from '@hapi/joi'` and their existing Joi 15 schemas. `Joi` re-exported by `above-framework` also remains Joi 15. New consumers can use `import Joi from 'joi'` with Joi 17.13.9. There is no mandatory alias or Joi migration.

`IHttp<typeof Schema.validate>` and `HttpContract` infer both schema families. The external `joi-extract-type` dependency is replaced by internal, automatically loaded declarations; its MIT attribution is retained in `THIRD_PARTY_NOTICES`.

Hapi validation delegates to the schema's original Joi instance, preserving consumer extensions. Pagination fields use the same instance as the route's query schema. Swagger reads a private copy of the route table and translates legacy descriptions only for documentation; request and response validation continue to use the original schemas.

As with Joi itself, use one Joi family inside a single composed schema. Separate routes and separate request inputs can use different families. Mixing a Joi 15 child directly inside a Joi 17 object is unsupported by Joi. Joi 15 and its dependencies are deprecated; retaining compatibility does not restore upstream maintenance.

## What is verified

`npm test` builds the framework, runs the portable Hapi integration suite and compiles consumer fixtures for both imports, typed decorators and `IHttp`. Tests assert inferred types and deliberately invalid assignments, so a silent fallback to `any` fails compilation.

`npm run test:coverage` instruments executable TypeScript with Istanbul before transpilation. Every source module is included; type-only declarations contain no executable statements and are checked by the compiler. All four thresholds are **100%**: lines, statements, functions and branches. There are no coverage ignore comments or source exclusions. Integration tests use real Hapi servers and `server.inject()`, real JWT signing and verification, real filesystem controller discovery and a local TCP Logstash receiver. Child processes cover startup and fatal rejection handling.

The suite covers decorators and HTTP methods, authentication failures, Joi errors and conversions, nested schemas, middleware order and short circuits, pagination and response envelopes, global schemas, CORS configuration, business exceptions, environment values, health checks, Swagger, logging and application lifecycle. Existing health endpoint responses remain unchanged.

`npm run test:package` installs the actual `npm pack` tarball into a clean consumer with production dependencies only and strict engine checks. Separate consumer installations of Joi 15 and Joi 17 exercise cross-package compatibility. It reruns integration and type tests against that installation, using TypeScript 6 with current Node declarations and TypeScript 4.9 with Node 12 declarations. Type packages are not bundled, allowing consumers to select their Node declaration version. Compatible Catbox and Shot declaration versions are pinned to avoid newer runtime dependencies introduced by their replacement stub packages.

`npm run test:matrix` verifies the same packed artifact in Linux x64 containers on all 16 exact Node versions in [the matrix](../.github/node-versions.json): 12.0.0, 12.22.12 and the latest selected stable patch of every major from 13 through 26, including odd majors. Official Node downloads are checked against their SHA-256 checksums. Each version uses its own bundled npm, performs a clean production installation with `--engine-strict`, and runs the complete integration suite. Logs and results are retained in `.artifacts/matrix`.

GitHub Actions builds once and distributes that tarball to the same version matrix. CircleCI also verifies the modern build, coverage and packed consumer. Automatic publishing has been removed from CI; this change does not publish a release.

## Packaging and security

The package includes its resolved production runtime dependencies. This makes the tested runtime tree reproducible and carries security overrides to consumers, whose npm otherwise ignores overrides declared by dependencies.

Before packing, the production dependency JavaScript is downleveled to ES2017, preserving module layout and data assets. Static CommonJS imports are resolved to concrete relative paths so Node 12.0 can load packages that now expose subpaths through `exports`. Built-in `node:` imports are normalized to their equivalent legacy names. Packages declaring an engine incompatible with Node 12.0 are rejected. Dependency declarations and licenses are preserved.

This permits corrected Inert, Content and Wreck versions while preserving the Node 12 floor. The compatible z-schema 5.0.4 line avoids an optional CLI dependency requiring Node 12.20. The tarball is larger because it includes the tested runtime tree.

Production and development audits are recorded separately. Production must have no moderate, high or critical advisories; development tooling blocks high and critical advisories and reports remaining moderate findings. The current remaining development findings originate from `glob` and `minimatch` bundled inside npm, propagated through release tooling, and TypeDoc's `minimatch` 10 dependency. npm's bundled packages cannot be replaced by root overrides. TypeDoc 0.28.20 calls `Minimatch.matchOne()`, removed in the fixed minimatch 11 line; forcing 11 breaks documentation generation, so its compatible 10.2.6 dependency remains pending an upstream TypeDoc fix. All are outside the published runtime tree:

- [glob AbortSignal traversal advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- [minimatch globparts amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Node 12 and the other retired Node lines are [end of life](https://nodejs.org/en/about/previous-releases). Passing the compatibility suite does not provide upstream runtime security support. Coverage and the version matrix provide evidence for the exercised contracts; they cannot prove compatibility with every unavailable consumer application or future Node release.

## Maintenance commands

```sh
nvm use
npm ci
npm run lint
npm run test:coverage
npm run test:types
npm run test:package
npm run test:baseline
npm run test:matrix
npm run doc
```

For one exact runtime, use `npm run test:matrix -- 12.0.0`. Docker and `tar` with xz support are required for local matrix verification. Download and installation failures fail the command; no missing runtime is silently skipped.
