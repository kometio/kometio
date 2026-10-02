const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // @node-rs/argon2 resolves its platform-specific native binding (e.g.
  // @node-rs/argon2-darwin-arm64) via a dynamic require() built from
  // process.platform/arch, not a static import specifier — webpack can't
  // trace that at build time and, left alone, tries to parse the .node
  // binary itself as JS and fails. node-loader tells webpack to treat
  // .node files as an opaque binary asset instead.
  module: {
    rules: [{ test: /\.node$/, loader: 'node-loader' }],
  },
  // NxAppWebpackPlugin's default externalDependencies:'all' externalizes
  // bare-specifier requires it finds in the *workspace root* node_modules,
  // but sharp is a project-local dependency of apps/api (only symlinked
  // under apps/api/node_modules, not hoisted to the root) so it's missed
  // and gets bundled instead. Bundled, its platform-detection code makes
  // webpack try to parse libvips's compiled .so as JavaScript and fail —
  // and even if that parsed, a native addon's dlopen of its shared lib
  // depends on the real on-disk relative layout, which bundling breaks.
  // sharp must never be bundled; force it external and let Node resolve
  // it from node_modules at runtime, same as it does unbundled.
  externals: [{ sharp: 'commonjs sharp' }],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      mergeExternals: true,
    }),
  ],
};
