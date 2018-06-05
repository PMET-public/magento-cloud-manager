const {exec, execOutputHandler, MC_CLI, logger} = require('./common')

const setVar = async (project, environment, name, value) => {
  const cmd = `${MC_CLI} variable:set -p ${project} -e ${environment} ${name} ${value}`
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

const getVar = async (project, environment, name) => {
  const cmd = `${MC_CLI} variable:get --pipe -p ${project} -e ${environment} ${name}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const val = stdout.trim()
      logger.mylog('info', `Value of ${name} is: ${val} on proj: ${project} env: ${environment}`)
      return val
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.getVar = getVar