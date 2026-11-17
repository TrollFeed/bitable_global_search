const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const htaccessContent = `# Serve static assets directly without parent directory rewrite rules
RewriteEngine Off

# Enable CORS (required by Feishu Base extensions)
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
  Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
  Header set Access-Control-Allow-Headers "Content-Type"
</IfModule>

# MIME types
AddType text/css .css
AddType application/javascript .js
AddType text/html .html
AddType application/json .json
AddType image/svg+xml .svg
AddType image/png .png
AddType image/jpeg .jpeg .jpg
AddType image/gif .gif
AddType font/woff .woff
AddType font/woff2 .woff2
AddType font/ttf .ttf

# Enable Gzip compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript
</IfModule>

# Cache static assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
  ExpiresByType text/html "access plus 1 hour"
</IfModule>

# Default index document
DirectoryIndex index.html
`;

class HtaccessPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('HtaccessPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'HtaccessPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          compilation.emitAsset('.htaccess', new compiler.webpack.sources.RawSource(htaccessContent));
        }
      );
    });
  }
}

module.exports = (_env, argv = {}) => ({
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    // Relative asset paths in production so chunks resolve cleanly when hosted
    // under a Feishu extension CDN subpath.
    publicPath: argv.mode === 'production' ? './' : '/',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            // Only compile files actually pulled into the bundle. Without this,
            // ts-loader compiles every file in tsconfig's "include" (src/**),
            // dragging *.test.ts and test-setup.ts into the build output.
            onlyCompileBundledFiles: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        bitableSdk: {
          test: /[\\/]node_modules[\\/]@lark-base-open[\\/]/,
          name: 'bitable-sdk',
          priority: 20,
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          name: 'react-vendor',
          priority: 15,
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
      },
    },
  },
  performance: {
    // The Feishu Base SDK (~960 KiB) must load at startup to read the base, so
    // the entrypoint is inherently large and can't be meaningfully code-split.
    // Budget accommodates it while still flagging unexpected growth beyond it.
    maxEntrypointSize: 1331200,
    maxAssetSize: 1024000,
    hints: 'warning',
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      inject: 'body',
    }),
    new HtaccessPlugin(),
  ],
  devServer: {
    port: 6350,
    hot: true,
    historyApiFallback: true,
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
