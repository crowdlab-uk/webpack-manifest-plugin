var path = require('path');
var MemoryFileSystem = require("memory-fs");

var webpack = require('webpack');
var _ = require('lodash');

var plugin = require('../index.js');
var ExtractTextPlugin = require('extract-text-webpack-plugin');

var OUTPUT_DIR = path.join(__dirname, './webpack-out');
var manifestPath = path.join(OUTPUT_DIR, 'manifest.json');

function webpackConfig (opts) {
  return _.merge({
    output: {
      path: OUTPUT_DIR,
      filename: '[name].js'
    },
    plugins: [
      new plugin(opts.manifestOptions)
    ]
  }, opts);
}

function webpackCompile(opts, cb) {
  var config;
  if (Array.isArray(opts)) {
    config = opts.map(webpackConfig);
  }
  else {
    config = webpackConfig(opts);
  }

  var compiler = webpack(config);

  var fs = compiler.outputFileSystem = new MemoryFileSystem();

  compiler.run(function(err, stats){
    var manifestFile = JSON.parse( fs.readFileSync(manifestPath).toString() );

    expect(err).toBeFalsy();
    expect(stats.hasErrors()).toBe(false);

    cb(manifestFile, stats);
  })
};

describe('ManifestPlugin', function() {

  it('exists', function() {
    expect(plugin).toBeDefined();
  });

  describe('basic behavior', function(){
    it('outputs a manifest of one file', function(done) {
      webpackCompile({
        entry: path.join(__dirname, './fixtures/file.js')
      }, function(manifest){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks).toBeDefined();
        expect(assetChunks['main']).toEqual('main.js');
        done();
      });

    });

    it('outputs a manifest of multiple files', function(done) {
      webpackCompile({
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
          two: path.join(__dirname, './fixtures/file-two.js')
        }
      }, function(manifest){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['one']).toEqual('one.js');
        expect(assetChunks['two']).toEqual('two.js');
        done();
      });
    });

    it('works with hashes in the filename', function(done) {
      webpackCompile({
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
        },
        output: {
          filename: '[name].[hash].js'
        }
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['one']).toEqual('one.' + stats.hash + '.js');
        done();
      });
    });

    it('works with source maps', function(done) {
      webpackCompile({
        devtool: 'sourcemap',
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
        },
        output: {
          filename: '[name].js'
        }
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['one.map']).toEqual('one.js.map');
        done();
      });
    });

    it('prefixes definitions with a base path', function(done) {
      webpackCompile({
        manifestOptions: {basePath: '/app/'},
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
        },
        output: {
          filename: '[name].[hash].js'
        }
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['/app/one']).toEqual('/app/one.' + stats.hash + '.js');
        done();
      });
    });

    it('prefixes paths with a public path', function(done) {
      webpackCompile({
        manifestOptions: {publicPath: '/app/'},
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
        },
        output: {
          filename: '[name].[hash].js'
        }
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['one']).toEqual('/app/one.' + stats.hash + '.js');
        done();
      });
    });

    it('prefixes definitions with a base path when public path is also provided', function(done) {
      webpackCompile({
        manifestOptions: {basePath: '/app/', publicPath: '/app/' },
        entry: {
          one: path.join(__dirname, './fixtures/file.js'),
        },
        output: {
          filename: '[name].[hash].js'
        }
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['/app/one']).toEqual('/app/one.' + stats.hash + '.js');
        expect(assetChunks['one']).toBe(undefined);
        done();
      });
    });

    it('combines manifests of multiple compilations', function(done) {
      var cache = {};
      webpackCompile([{
        entry: {
          one: path.join(__dirname, './fixtures/file.js')
        },
        manifestOptions: {
          cache: cache
        }
      }, {
        entry: {
          two: path.join(__dirname, './fixtures/file-two.js')
        },
        manifestOptions: {
          cache: cache
        }
      }], function(manifest){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['one']).toEqual('one.js');
        expect(assetChunks['two']).toEqual('two.js');
        done();
      });
    });

    it('outputs an empty errors array', function(done) {
      webpackCompile({
        entry: path.join(__dirname, './fixtures/file.js')
      }, function(manifest){
        var errors = manifest.errors;
        expect(errors).toBeDefined();
        expect(errors).toEqual([]);
        done();
      });
    });
  });

  describe('with ExtractTextPlugin', function(){
    it('works when extracting css into a seperate file', function(done){
      webpackCompile({
        entry: {
          wStyles: [
            path.join(__dirname, './fixtures/file.js'),
            path.join(__dirname, './fixtures/style.css')
          ]
        },
        output: {
          filename: '[name].js'
        },
        module: {
          loaders: [{
            test: /\.css$/,
            loader: ExtractTextPlugin.extract('style', 'css')
          }]
        },
        plugins: [
          new plugin(),
          new ExtractTextPlugin('[name].css', {
            allChunks: true
          })
        ]
      }, function(manifest, stats){
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['wStyles']).toEqual('wStyles.js');
        expect(assetChunks['wStyles.css']).toEqual('wStyles.css');
        done();
      });

    });
  });

  describe('nameless chunks', function() {
    it('add a literal mapping of files generated by nameless chunks.', function(done) {
      webpackCompile({
        entry: { nameless: path.join(__dirname, './fixtures/nameless.js') },
        output: { filename: '[name].[hash].js' }
      }, function(manifest, stats) {
        var assetChunks = manifest.assetsByChunkName;
        expect(assetChunks['nameless']).toEqual('nameless.'+ stats.hash +'.js');
        expect(assetChunks['1.1.'+ stats.hash]).toEqual('1.1.'+ stats.hash +'.js');
        done();
      });
    });
  });
});
