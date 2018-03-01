const {exec, db, apiLimit, MC_CLI, logger} = require('./common')
const {getProjectsFromApi} = require('./project')

function updateEnvironment(project, environment = 'master') {
  return exec(`${MC_CLI} environment:info -p ${project} -e "${environment}" --format=tsv`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      const title = stdout.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const machineName = stdout.replace(/[\s\S]*machine_name\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const active = /\nstatus\s+active/.test(stdout) ? 1 : 0
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      return db
        .prepare(
          'INSERT OR REPLACE INTO environments (id, project_id, title, machine_name, active, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(environment, project, title, machineName, active, createdAt)
    })
    .catch(error => {
      logger.error(error)
    })
}

exports.setEnvironmentInactive = function setEnvironmentInactive(project, environment) {
  return db
    .prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
}

exports.setEnvironmentFailed = function setEnvironmentFailed(project, environment) {
  return db
    .prepare('UPDATE environments SET failure = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
}

exports.getEnvironmentsFromAPI = function getEnvironmentsFromAPI(project) {
  return exec(`${MC_CLI} environments -p ${project} --pipe`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      return stdout.trim().split('\n')
    })
    .catch(error => {
      logger.error(error)
    })
}

exports.updateAllCurrentProjectsEnvironmentsFromAPI = async function updateAllCurrentProjectsEnvironmentsFromAPI() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(async () => {
        const environments = await getEnvironmentsFromAPI(project)
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
exports.deleteInactiveEnvironments = async function deleteInactiveEnvironments() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(() => {
        exec(`${MC_CLI} environment:delete -p ${project} --inactive --no-delete-branch --no-wait -y`)
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
