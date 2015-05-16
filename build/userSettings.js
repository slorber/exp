'use strict';

var _ = require('lodash-node');
var instapromise = require('instapromise');
var jsonFile = require('@exponent/json-file');
var mkdirp = require('mkdirp');
var path = require('path');

// TODO: Make this more configurable
function userSettingsFile() {
  return path.join(dotExponentDirectory(), 'exponent.json');
}

function userSettingsJsonFile() {
  return new jsonFile(userSettingsFile(), { cantReadFileDefault: {} });
}

function dotExponentDirectory() {
  if (!process.env.HOME) {
    throw new Error('Can\'t determine your home directory; make sure your $HOME environment variable is set.');
  }
  return path.join(process.env.HOME, '.exponent');
}

module.exports = userSettingsJsonFile;

_.assign(module.exports, {
  userSettingsJsonFile: userSettingsJsonFile,
  userSettingsFile: userSettingsFile,
  dotExponentDirectory: dotExponentDirectory });
//# sourceMappingURL=sourcemaps/userSettings.js.map