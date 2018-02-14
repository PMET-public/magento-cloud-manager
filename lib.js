const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const sqlite3 = require('sqlite3');
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';
const db = new sqlite3.Database('sql/cloud.db');
const pLimit = require('p-limit');
const limit = pLimit(10);
const apiLimit = pLimit(20);
const sshLimit = pLimit(10);




