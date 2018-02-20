const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');

const pLimit = require('p-limit');
const winston = require('winston');
winston.add(winston.transports.File, {filename: `${__dirname}/../log.json`});

const db = new Database(`${__dirname}/../sql/cloud.db`);
const {prepare} = db;
db.prepare = function () {
  winston.info(arguments[0]);
  return prepare.apply(this, arguments);
};

exports.db = db;

exports.exec = function () {
  winston.info(arguments[0]);
  return exec.apply(this, arguments);
};

exports.winston = winston;
exports.apiLimit = pLimit(8);
exports.sshLimit = pLimit(4);
exports.MC_CLI = '~/.magento-cloud/bin/magento-cloud';

