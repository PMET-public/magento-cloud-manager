const https = require('https')
const {exec, execOutputHandler, db, apiLimit, MC_CLI, logger} = require('./common')
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
      logger.mylog('info', `Env updated.`)
      return result
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
    cd "/tmp/${project}-${environment}"
    pwd
    git commit -m "redeploy" --allow-empty
    git push
    cd ..
    rm -rf "/tmp/${project}-${environment}"
  `)
    .then(execOutputHandler)
    .catch(error => {
      logger.mylog('error', error)
    })
}

exports.checkCertificate = async (project, environment) => {
  let result = db
    .prepare(
      `SELECT machine_name, region FROM environments e 
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE p.id = ? AND e.id = ?
      `
    )
    .get(project, environment)
  logger.mylog('debug', result)
  const hostName = `${result.machine_name}-${project}.${result.region}.magentosite.cloud`
  result = await new Promise((resolve, reject) => {
    const request = https.request({host: hostName, port: 443, method: 'GET', rejectUnauthorized: false}, response => {
      const certificateInfo = response.connection.getPeerCertificate()
      const expiration = Math.floor(new Date(certificateInfo.valid_to) / 1000)
      const result = db
        .prepare('INSERT OR REPLACE INTO cert_expirations (host_name, expiration) VALUES (?, ?)')
        .run(hostName, expiration)
      resolve({...result, expiration: expiration, host: hostName})
    })
    request.end()
  })
  logger.mylog('debug', result)
  logger.mylog('info', `${result.host} expires on ${new Date(result.expiration*1000).toDateString()}`)
  return result
}

exports.redeployExpiringEnvs = async () => {
  const expirationInAWk = new Date() / 1000 + 24 * 60 * 60 * 7
  exports.getAllLiveEnvironmentsFromDB().forEach(async ({project_id, environment_id, host_name, expiration}) => {
    if (expiration < expirationInAWk) {
      // b/c redeploys are expensive compared to checking the expiration, check first
      const result = await exports.checkCertificate(project_id, environment_id)
      console.log(result)
    }
  })
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
    .prepare(
      `
      SELECT e.id environment_id, e.project_id,  c.host_name, c.expiration
      FROM environments e 
      LEFT JOIN projects p ON e.project_id = p.id 
      LEFT JOIN cert_expirations c ON 
        c.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
      WHERE e.active = 1 AND (e.failure = 0 OR e.failure IS null)
    `
    )
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

exports.execInEnv = function(project, environment, filePath) {
  // create a unique remote tmp file to run
  // do not delete it to identify what's been run in an env
  const file = '/tmp/' + Math.floor(new Date() / 1000) + '-' + filePath.replace(/.*\//, '')
  const ssh = `${MC_CLI} ssh -p "${project}" -e "${environment}"`
  const remoteCmd = /\.sql$/.test(file)
    ? `mysql main -h database.internal < "${file}"`
    : `chmod +x "${file}"; "${file}"`
  return exec(`
    scp "${filePath}" $(${ssh} --pipe):"${file}"
    ${ssh} '${remoteCmd}'
  `)
    .then(execOutputHandler)
    .catch(error => {
      logger.mylog('error', error)
    })
}
