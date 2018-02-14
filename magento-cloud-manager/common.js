const util = require('util');
const child_process = require('child_process');
//const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');
//const db = new Database('sql/cloud.db');
const pLimit = require('p-limit');
//const apiLimit = pLimit(10);
//const MC_CLI = '~/.magento-cloud/bin/magento-cloud';


exports.exec = util.promisify(child_process.exec);
exports.db = new Database('sql/cloud.db');
exports.apiLimit = pLimit(15);
exports.sshLimit = pLimit(10);
exports.MC_CLI = '~/.magento-cloud/bin/magento-cloud';

const {exec, db, apiLimit, sshLimit, MC_CLI} = require('./common');
