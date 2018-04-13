const {exec, execOutputHandler, MC_CLI, logger} = require('./common')

const setVar = async (project, environment, name, value) => {
  const cmd = `${MC_CLI} variable:set --wait -p ${project} -e ${environment} ${name} ${value}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return true
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.setVar = setVar