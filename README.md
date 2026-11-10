<div align="center">
  <img src="https://repository-images.githubusercontent.com/194421148/5ca00800-c9eb-11e9-803e-a5db262ac5f5" width="600px">
</div>

<br />

Above is a CommonJS framework for Node.js **12.0+**. Development and coverage use Node **26.13.0** (`nvm use`).

Existing applications can keep Joi 15 (`@hapi/joi`); applications using Joi 17 (`joi`) are supported too. Typed controllers retain `IHttp<typeof Schema.validate>` with internal inference for both versions.

The integration suite exercises Hapi and Above features with a 100% coverage gate. CI verifies the published package across 16 Node versions, including Node 12.0.0.

See [compatibility, security limits and verification commands](docs/compatibility.md).
