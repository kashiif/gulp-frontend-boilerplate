import path from 'path';
import gulp from 'gulp';
import { exec } from 'child_process';

import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import browserify from 'browserify';
import watchify from 'watchify';

import gutil from 'gulp-util';
import uglify from 'gulp-uglify';
import header from 'gulp-header';
import rename from 'gulp-rename';

import { reload } from './serve';
import config, { getConfig } from '../config';
import bundleLogger from '../utils/bundleLogger';
import handleErrors from '../utils/handleErrors';
import concatenateFiles from '../utils/concatenateFiles';

import es from 'event-stream';

const envDev = config.args.env === 'dev';

const files = [
  `main.${config.extensions.scripts}`,
].concat(config.bundles);

const bundle = (done) => {

  bundleLogger.start();

  // map them to our stream function
  const streams = files.map((entry) => {

    let entries,
        entryLibName = null;
    if (typeof entry === 'string') {
      entries = [entry];
      entryLibName = entry;
    }
    else {
      let allKeys = Object.keys(entry);

      if (allKeys.length) {
        entryLibName = allKeys[0];
        entries = entry[entryLibName];
        entries = typeof entries === 'string'? [entries] : entries;
      }
    }

    entries = entries.map((filePath) => {
      return path.join(`${config.src}/scripts/`, filePath);
    });

    const b = browserify({
      entries: entries,
      extensions: [config.extensions.scripts],
      debug: envDev,
      cache: {},
      packageCache: {},
      fullPaths: envDev
    });

    const bundler = envDev ? watchify(b) : b;

    function singleBundle() {
      const outputPath = path.join(`${config.dist}/scripts`, path.dirname(entryLibName));

      return bundler
        .bundle()
        .on('error', handleErrors)
        .pipe(source(path.basename(entryLibName)))
        .on('error', handleErrors)
        .pipe(buffer())
        .on('error', handleErrors)
        .pipe(envDev ? gutil.noop() : uglify())
        .on('error', handleErrors)
        .pipe(envDev ? gutil.noop() : header(config.banner))
        .pipe(envDev ? gutil.noop() : rename({
          suffix: '.min'
        }))
        .on('end', () => {
          if (envDev) {
            reload(() => {});
          }
        })
        .pipe(gulp.dest(outputPath));


    }


    const stream = singleBundle();

    if (envDev) {
      bundler.on('update', singleBundle);
    }

    return stream;
  });

  es.merge.apply(null, streams)
  .on('end', () => {
    if (envDev) {
      reload(() => {});
    } else {
      done();
    }
    bundleLogger.end();
  });
};


export function bundleApp(done) {
  if (envDev) {
    bundle();
    done();
  } else {
    bundle(done);
  }
}

export function bundleVendor(done) {
  const updatedConfig = getConfig();

  concatenateFiles({
    src: updatedConfig.vendors,
    dest: `${updatedConfig.dist}/scripts`,
    fileName: 'vendor.js'
  }, () => {
    if (!envDev) {
      const cmd = `./node_modules/.bin/uglifyjs ${updatedConfig.dist}/scripts/vendor.js \
        -o ${updatedConfig.dist}/scripts/vendor.min.js`;

      exec(cmd, (error) => {
        if (error !== null) {
          console.log(`exec error: ${error}`);
        } else {
          done();
        }
      });
    } else {
      done();
    }
  });
}
