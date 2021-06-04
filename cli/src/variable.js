const {exec, execOutputHandler, MC_CLI, logger} = require('./common')

const setVar = async (project, environment, name, value) => {
  // handle COMPOSER_AUTH as special case b/c probably the only 'env:' var used
  if (name == 'COMPOSER_AUTH') {
    name = 'env:COMPOSER_AUTH'
  }
  let subcommand, cmd = `${MC_CLI} variable:get --property=value -p "${project}" -e "${environment}" ${name}`
  const status = await exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      stdout = stdout.trim()
      if (stdout == value) {
        logger.mylog('info', 'New value == current value. Skipping ...')
        return 'new == curent'
      }
      return `update: ${stdout}`
    })
    .catch(error => {
      if (/Variable not found/i.test(error.stderr)) {
        logger.mylog('debug', error.stderr)
        return 'create'
      } else if (/Property not found/i.test(error.stderr)) {
        logger.mylog('debug', error.stderr)
        return 'update'
      } else if (/variable is sensitive/i.test(error.stderr)) {
        logger.mylog('debug', error.stderr)
        return 'update'
      }
      logger.mylog('error', error)
    })
  switch (status) {
  case 'new == curent':
    return
  case 'create':
    subcommand = 'create'
    break
  default:
    subcommand = 'update'
  }

  cmd = `${MC_CLI} variable:${subcommand} -p "${project}" -e "${environment}" --value='${value}' \
    ${name == 'env:COMPOSER_AUTH' ? // eslint-disable-next-line indent
      '-l project --visible-build=true --visible-runtime=false --json=true --sensitive=true' : '-l environment'} \
    ${subcommand == 'create' ? '--name=' : ''}'${name}'`
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
  if (name == 'COMPOSER_AUTH') {
    name = 'env:COMPOSER_AUTH'
    logger.mylog('debug', 'Using env:COMPOSER_AUTH instead of COMPOSER_AUTH ...')
  }
  const cmd = `${MC_CLI} variable:get --property=value -p "${project}" -e "${environment}" ${name}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const val = stdout.trim()
      logger.mylog('info', `Value of ${name} is: ${val} on proj: ${project} env: ${environment}`)
      return val
    })
    .catch(error => {
      if (/Property not found/i.test(error.stderr)) {
        // this should not be considered an error, but the CLI has a non-zero exit status
        // log the "error" for verbose mode and return an empty array
        logger.mylog('info', 'Sensitive value hidden.')
        return true
      }
      throw error
    })
  return result
}
exports.getVar = getVar