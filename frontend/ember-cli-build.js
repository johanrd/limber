'use strict';

const yn = require('yn');
const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  let environment = EmberApp.env();
  let isProduction = environment === 'production';

  let SOURCEMAPS = yn(process.env.SOURCEMAPS) ?? false;
  let MAXIMUM_STATIC = yn(process.env.MAXIMUM_STATIC) ?? false;
  let MINIFY = yn(process.env.MINIFY) ?? isProduction;

  console.info(`
    Building:
      SOURCEMAPS: ${SOURCEMAPS}
      MINIFY: ${MINIFY}
      MAXIMUM_STATIC: ${MAXIMUM_STATIC}

      isProduction: ${isProduction}
  `);

  let config = {
    sourcemaps: {
      enabled: SOURCEMAPS,
    },
    'ember-cli-terser': {
      enabled: MINIFY,
    },
    fingerprint: { exclude: ['transpilation-worker.js'] },
    postcssOptions: {
      compile: {
        map: SOURCEMAPS,
        plugins: [require('@tailwindcss/jit')('./tailwind.config.js'), require('autoprefixer')()],
        cacheInclude: [/.*\.(css|hbs)$/, /.tailwind\.config\.js$/],
      },
    },
  };

  let app = new EmberApp(defaults, config);

  app.import('vendor/ember/ember-template-compiler.js');

  const { Webpack } = require('@embroider/webpack');
  const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

  return require('@embroider/compat').compatBuild(app, Webpack, {
    extraPublicTrees: [
      // Mobile Editor
      require('@nullvoxpopuli/limber-codemirror/broccoli-funnel')(),
      // Desktop Editor
      require('@nullvoxpopuli/limber-monaco/broccoli-funnel')(),
    ],
    skipBabel: [
      {
        package: 'qunit',
      },
      {
        package: 'monaco-editor',
      },
      {
        package: '@babel/standalone',
      },
    ],
    ...(MAXIMUM_STATIC
      ? {
          staticAddonTrees: true,
          staticAddonTestSupportTrees: true,
          staticHelpers: true,
          staticComponents: true,
          splitControllers: true,
          splitRouteClasses: true,
          // staticAppPaths: [],
          // splitAtRoutes: [],
        }
      : {}),
    packagerOptions: {
      webpackConfig: {
        // this option might not be working?
        devtool: SOURCEMAPS ? 'eval-source-map' : 'none',
        module: {
          rules: [
            {
              test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
              use: ['file-loader'],
            },
          ],
        },

        node: {
          fs: 'empty',
          path: 'empty',
          // module: 'empty',
          net: 'empty',
          v8: 'empty',
        },
        resolve: {
          alias: {
            path: 'path-browserify',
          },
        },
        plugins: [
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: 'bundle.html',
          }),
        ],
      },
    },
    // required due to this app being a dynamic component generator
    allowUnsafeDynamicComponents: true,
  });
};