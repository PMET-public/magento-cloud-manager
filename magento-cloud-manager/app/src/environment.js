const {exec, db, apiLimit, MC_CLI, logger} = require('./common')
const {getProjectsFromApi} = require('./project')

exports.updateEnvironment = function(project, environment = 'master') {
  return exec(`${MC_CLI} environment:info -p "${project}" -e "${environment}" --format=tsv`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      logger.debug(stdout)
      const title = stdout.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const machineName = stdout.replace(/[\s\S]*machine_name\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const active = /\nstatus\s+active/.test(stdout) ? 1 : 0
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      // be careful to preserve 'failure' on existing envs when using INSERT OR REPLACE
      // however if the MC_CLI cmd succeeded the env is not missing
      const result = db
        .prepare(
          `INSERT OR REPLACE INTO environments (id, project_id, title, machine_name, active, created_at, failure, missing) 
          VALUES (?, ?, ?, ?, ?, ?,
            (SELECT failure FROM environments WHERE id = ? and project_id = ?),
            1  
          )`
        )
        .run(environment, project, title, machineName, active, createdAt, environment, project)
      logger.debug(JSON.stringify(result))
      return result
    })
    .catch(error => {
      logger.error(error)
      if (/Specified environment not found/.test(error.message)) {
        const [prefix, project, environment] = error.cmd.match(/.* -p\s+"([^ ]+)"\s+-e\s"([^"]+)"/)
        const result = db
          .prepare('UPDATE environments SET missing = 1 WHERE id = ? and project_id = ?')
          .run(environment, project)
      }
    })
}

exports.setEnvironmentInactive = function(project, environment) {
  const result = db
    .prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.debug(JSON.stringify(result))
  return result
}

exports.setEnvironmentFailed = function(project, environment) {
  const result = db
    .prepare('UPDATE environments SET failure = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.debug(JSON.stringify(result))
  return result
}

exports.getEnvironmentsFromAPI = function(project) {
  return exec(`${MC_CLI} environments -p ${project} --pipe`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      logger.debug(stdout)
      return stdout.trim().split('\n')
    })
    .catch(error => {
      logger.error(error)
    })
}

exports.updateAllCurrentProjectsEnvironmentsFromAPI = async function() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(async () => {
        const environments = await exports.getEnvironmentsFromAPI(project)
        environments.forEach(environment => {
          updateEnvironment(project, environment)
        })
      })
    )
  })
  const result = await Promise.all(promises)
  return result
}

// need to delete from child first
// or how to warn if inactive parent & active child?
exports.deleteInactiveEnvironments = async function() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(() => {
        exec(`${MC_CLI} environment:delete -p ${project} --inactive --delete-branch --no-wait -y`)
          .then(({stdout, stderr}) => {
            if (stderr) {
              throw stderr
            }
            logger.debug(stdout)
          })
          .catch(error => {
            logger.error(error)
          })
      })
    )
  })
  return await Promise.all(promises)
}
