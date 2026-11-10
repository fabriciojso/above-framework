'use strict';
const fs = require('fs');
if (!process.env.CI && fs.existsSync('.git')) {
  import('husky').then((module) => console.log(module.default()));
}
