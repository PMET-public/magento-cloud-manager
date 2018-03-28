const exec = require('util').promisify(require('child_process').exec)

exports.execCmd = (args = '') => {
  const cmd = `../bin/mcm.js ${args}`
  return exec(cmd, {cwd: __dirname}).catch(error => error)
}
