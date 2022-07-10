'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const copy = require('recursive-copy');
const esbuild = require('esbuild');

const OUTPUT_DIR = path.join(__dirname, 'dist').toString();

const isWatch = process.argv.includes('--watch');

if (isWatch) {
  console.info(`Starting watch mode...`);
}
module.exports = async function build() {
  let buildDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monaco--workers-'));

  await esbuild.build({
    loader: { '.ts': 'ts', '.js': 'js', '.ttf': 'file' },
    entryPoints: [path.join('preconfigured', 'index.ts')],
    bundle: true,
    outfile: path.join(buildDir, 'preconfigured.js'),
    format: 'esm',
    // minification breaks codemirror somehow
    minify: false,
    watch: isWatch ? {
      onRebuild(error, result) {
        if (error) console.error('watch build failed:', error)
        else console.log('watch build succeeded:', result)
      }
    } : false,
    sourcemap: false,
  });

  await copy(`${buildDir}`, OUTPUT_DIR, {
    overwrite: true,
    filter: ['**/*'],
  });
};

if (require.main === module) {
  module.exports();
}
