'use strict';

const fs = require('fs');
const argv = require('yargs').argv;
const readlineSync = require('readline-sync');

const helpers = require('./lib/helpers');
const log = require('./lib/log');


const pathToRoot = process.cwd();
const pathToPackage = argv.pathToPackage || `${pathToRoot}/package.json`;
const info = helpers.getPackageInfo(pathToPackage);

const pathToPlist = argv.pathToPlist || `${pathToRoot}/ios/${info.name}/Info.plist`;
const pathToGradle = argv.pathToGradle || `${pathToRoot}/android/app/build.gradle`;
// handle case of several plist files
const pathsToPlists = Array.isArray(pathToPlist) ? pathToPlist : [pathToPlist];


// getting next version
const versionCurrent = info.version;
const versions = helpers.versions(versionCurrent);
let major = helpers.version(versions[0], argv.major);
let minor = helpers.version(versions[1], argv.minor, argv.major);
let patch = helpers.version(versions[2], argv.patch, argv.major || argv.minor);
const version = `${major}.${minor}.${patch}`;


// getting next build number
const buildCurrent = helpers.getBuildNumberFromPlist(pathsToPlists[0]);

let build = 1;
if (version !== versionCurrent) {
  log.warning('\nNew version, build number will be reset to 1.');
} else {
  build = buildCurrent + 1;
  log.warning('\nSame as current version, build number will be increased by 1.');
}

const versionCode = 1000000 * major + 10000 * minor + 100 * patch + build;

// getting commit message
const messageTemplate = argv.m || argv.message || 'release ${version} (${build})';
const messageTemplateBuild = messageTemplate.replace('${build}', build);
const message = messageTemplateBuild.replace('${version}', version);

log.info('\nI\'m going to increase the version in:');
log.info(`- package.json (${pathToPackage});`, 1);
log.info(`- ios project (${pathsToPlists.join(', ')});`, 1);
log.info(`- android project (${pathToGradle}).`, 1);

log.notice(`\nThe version will be changed:`);
log.notice(`- from: ${versionCurrent} (${buildCurrent});`, 1);
log.notice(`- to: iOS version string: ${version}, bundle version: ${build}.`, 1);
log.notice(`- to: Android versionName: ${version}, versionCode: ${versionCode}.`, 1);


const chain = new Promise((resolve, reject) => {
  log.line();

  if (versions.length !== 3) {
    log.warning(`I can\'t understand format of the version "${versionCurrent}".`);
  }

  const question = log.info(`Use "${version}" as the next version? [y/n] `, 0, true);
  const answer = readlineSync.question(question).toLowerCase();
  answer === 'y' ? resolve() : reject('Process canceled.');
});


const update = chain.then(() => {
  log.notice('\nUpdating versions');
}).then(() => {
  log.info('Updating version in package.json...', 1);

  helpers.changeVersionInPackage(pathToPackage, version);
  log.success(`Version in package.json changed.`, 2);
}).then(() => {
  log.info('Updating version in xcode project...', 1);

  pathsToPlists.forEach(pathToPlist => {
    helpers.changeVersionAndBuildInPlist(pathToPlist, version, build);
  });
  log.success(`Version and build number in ios project (plist file) changed.`, 2);
}).then(() => {
  log.info('Updating version in android project...', 1);

  helpers.changeVersionAndBuildInGradle(pathToGradle, version, versionCode);
  log.success(`Version and build number in android project (gradle file) changed.`, 2);
});

const commit = update.then(() => {
  log.notice(`\nI'm ready to cooperate with the git!`);
  log.info('I want to make a commit with message:', 1);
  log.info(`"${message}"`, 2);
  if (version !== versionCurrent) {
    log.info(`I want to add a tag:`, 1);
    log.info(`"v${version}"`, 2);
  }

  const question = log.info(`Do you allow me to do this? [y/n] `, 1, true);
  const answer = readlineSync.question(question).toLowerCase();
  if (answer === 'y') {
    if (version !== versionCurrent) {
      return helpers.commitVersionIncrease(version, message, [
        pathToPackage,
        ...pathsToPlists,
        pathToGradle
      ]).then(() => {
        log.success(`Commit with files added. Run "git push".`, 1);
      });
    } else {
      return helpers.commitBuildIncrease(version, message, [
        pathToPackage,
        ...pathsToPlists,
        pathToGradle
      ]).then(() => {
        log.success(`Commit with files added. Run "git push".`, 1);
      });
    }
  } else {
    log.warning(`Skipped.`, 1);
  }
});

commit.then(() => {
  log.success(`\nDone!`);
}).catch(e => {
  log.line();
  log.error(e)
});
