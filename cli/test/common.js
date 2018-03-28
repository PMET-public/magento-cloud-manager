const exec = require('util').promisify(require('child_process').exec)

exports.execCmd = async (args = '') => {
  const cmd = `../bin/mcm.js ${args}`
  const result = exec(cmd, {cwd: __dirname}).catch(error => error)
  return result
}
