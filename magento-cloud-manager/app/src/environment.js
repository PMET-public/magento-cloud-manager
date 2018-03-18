const {exec, execOutputHandler, db, apiLimit, MC_CLI, logger, checkCertificate} = require('./common')
const {getProjectsFromApi} = require('./project')

exports.updateEnvironment = async function(project, environment = 'master') {
  return exec(`${MC_CLI} environment:info -p "${project}" -e "${environment}" --format=tsv`)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      const title = stdout.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const machineName = stdout.replace(/[\s\S]*machine_name\s*([^\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const active = /\nstatus\s+active/.test(stdout) ? 1 : 0
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      // be careful to preserve 'failure' and 'cert_expiration' on existing envs when using INSERT OR REPLACE
      // however if the MC_CLI cmd succeeded the env is not missing (0)
      let result = db
        .prepare(
          `INSERT OR REPLACE INTO environments (id, project_id, title, machine_name, active, last_created_at, missing, failure) 
          VALUES (?, ?, ?, ?, ?, ?, 0,
            (SELECT failure FROM environments WHERE id = ? and project_id = ?)
          )`
        )
        .run(environment, project, title, machineName, active, createdAt, environment, project)
      logger.mylog('debug', result)
      result = db.prepare('SELECT region FROM projects WHERE id = ?').get(project)
      const serverName = `${machineName}-${project}.${result.region}.magentosite.cloud`
      return await checkCertificate(serverName)
    })
    .catch(error => {
      logger.mylog('error', error)
      if (/Specified environment not found/.test(error.message)) {
        const [prefix, project, environment] = error.cmd.match(/.* -p\s+"([^ ]+)"\s+-e\s"([^"]+)"/)
        exports.setEnvironmentMissing(project, environment)
      }
    })
}

exports.setEnvironmentInactive = function(project, environment) {
  const result = db
    .prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  return result
}

exports.setEnvironmentFailed = function(project, environment) {
  const result = db
    .prepare('UPDATE environments SET failure = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  return result
}

exports.setEnvironmentMissing = function(project, environment) {
  const result = db
    .prepare('UPDATE environments SET missing = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  return result
}

exports.redeployEnv = function(project, environment = 'master') {
  return exec(`${MC_CLI} get -e ${environment} ${project} "/tmp/${project}-${environment}"
  cd "${project}-${environment}"
  pwd
  git commit -m "redeploy" --allow-empty
  git push
  cd ..
  `)
  .then(execOutputHandler)
  .then(({stdout, stderr}) => {
    return stdout.trim().split('\n')
  })
  .catch(error => {
    logger.mylog('error', error)
  })
  
  // rm -rf "${project}-${environment}"

}

exports.getEnvironmentsFromAPI = function(project) {
  return exec(`${MC_CLI} environments -p ${project} --pipe`)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => {
      logger.mylog('error', error)
    })
}

exports.getAllLiveEnvironmentsFromDB = () => {
  const result = db
    .prepare('SELECT id, project_id FROM environments WHERE active = 1 AND (failure = 0 OR failure IS null)')
    .all()
  logger.mylog('debug', result)
  return result
}

exports.updateAllCurrentProjectsEnvironmentsFromAPI = async function() {
  // mark all envs inactive and missing; then only found, active ones will be updated
  const result = db.prepare('UPDATE environments SET active = 0, missing = 1').run()
  logger.mylog('debug', result)
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(async () => {
        const environments = await exports.getEnvironmentsFromAPI(project)
        // use for loop instead of forEach w/ lambda to respect apiLimit
        for (let i = 0; i < environments.length; i++) {
          await exports.updateEnvironment(project, environments[i])
        }
      })
    )
  })
  const promiseResult = await Promise.all(promises)
  return promiseResult
}

// need to delete from child first
// or how to warn if inactive parent & active child?
exports.deleteInactiveEnvironments = async function() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(() => {
        exec(`${MC_CLI} environment:delete -p ${project} --inactive --delete-branch --no-wait -y`)
          .then(execOutputHandler)
          .catch(error => {
            logger.mylog('error', error)
          })
      })
    )
  })
  return await Promise.all(promises)
}
