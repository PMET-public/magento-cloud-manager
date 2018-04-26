const {exec, execOutputHandler, db, MC_CLI, logger} = require('./common')

const addUser = async (project, environment, email, role) => {
  role = environment === 'master' ? role : environment + ':' + role
  const cmd = `${MC_CLI} user:update --no-wait --yes -p ${project} -r ${role} ${email}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return true
    })
    .catch(error => {
      if (/owner.*cannot be changed/i.test(error.stderr)) {
        return true // treat adding owner as non-error
      }
      logger.mylog('error', error)
    })
  return result
}
exports.addUser = addUser

const delUser = async (project, environment, email) => {
  const cmd = `${MC_CLI} user:delete -p ${project} ${email}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.delUser = delUser

const recordUsers = async project => {
  const cmd = `${MC_CLI} user:list -p ${project} --format=tsv | sed '1d'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const insertValues = []
      stdout
        .trim()
        .split('\n')
        .map(row => row.split('\t'))
        .forEach(row => insertValues.push(`("${project}", "${row[0]}", "${row[2]}")`))
      const sql = `DELETE FROM users WHERE project_id = "${project}";
        INSERT INTO users (project_id, email, role) VALUES ${insertValues.join(',')}`
      const result = db.exec(sql)
      logger.mylog('debug', result)
      return true
    })
  return result
}
exports.recordUsers = recordUsers