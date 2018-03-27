const exec = require('util').promisify(require('child_process').exec)
exports.execCmd = (cmd = '') => {
  return exec(`../bin/mcm.js ${cmd}`, {cwd: __dirname}).catch(error => error)
}
