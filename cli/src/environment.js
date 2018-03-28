const https = require('https')
const {exec, execOutputHandler, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')
const { localCloudSshKeyPath } = require('../config.json')
const {getProjectsFromApi} = require('./project')

exports.updateEnvironment = async (project, environment = 'master') => {
  const cmd = `${MC_CLI} environment:info -p "${project}" -e "${environment}" --format=tsv`
  return exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
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
      logger.mylog('info', `Env: ${environment} of project: ${project} updated.`)
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

exports.setEnvironmentInactive = (project, environment) => {
  const result = db
    .prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  return result
}

exports.setEnvironmentFailure = (project, environment, value) => {
  const result = db
    .prepare('UPDATE environments SET failure = ?, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(value, project, environment)
  logger.mylog('debug', result)
  return result
}

exports.setEnvironmentMissing = (project, environment) => {
  const result = db
    .prepare('UPDATE environments SET missing = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  return result
}

exports.redeployEnv = async (project, environment = 'master') => {
  const cmd = `${MC_CLI} get -e ${environment} ${project} "/tmp/${project}-${environment}"
    cd "/tmp/${project}-${environment}"
    pwd
    git commit -m "redeploy" --allow-empty
    git push
    cd ..
    rm -rf "/tmp/${project}-${environment}"`
  return exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} redeployed.`)
    })
    .catch(error => logger.mylog('error', error))
}

exports.redeployExpiringEnvs = async () => {
  const promises = []
  const expirationInAWk = new Date() / 1000 + 24 * 60 * 60 * 7
  let counter = 0
  // get live envs from db b/c if they are about to expire they are not new and we can use older data
  exports.getAllLiveEnvironmentsFromDB().forEach(({project_id, environment_id, expiration}) => {
    promises.push(sshLimit(async () => {
      if (expiration < expirationInAWk) {
        // redeploys are expensive compared to rechecking expiration, so update check to prevent unnecessary redeploys
        let result = await exports.checkCertificate(project_id, environment_id)
        if (result.expiration < expirationInAWk) {
          result = await exports.redeployEnv(project_id, environment_id)
          counter++
        }
        return result
      }
    }))
  })
  const result = await Promise.all(promises)
  logger.mylog('info', `${counter} expiring projects redeployed`)
  return result
}

exports.checkCertificate = async (project, environment = 'master') => {
  try {
    const hostName = getHostName(project, environment)
    const result = await new Promise((resolve, reject) => {
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
  } catch (error) {
    logger.mylog('error',error)
  }
}

exports.getEnvironmentsFromAPI = (project) => {
  const cmd = `${MC_CLI} environments -p ${project} --pipe`
  return exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => logger.mylog('error', error))
}

exports.getAllLiveEnvironmentsFromDB = () => {
  const sql = `SELECT e.id environment_id, e.project_id, c.expiration
    FROM environments e 
    LEFT JOIN projects p ON e.project_id = p.id 
    LEFT JOIN cert_expirations c ON 
      c.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
    WHERE e.active = 1 AND (e.failure = 0 OR e.failure IS null)`
  const result = db.prepare(sql).all()
  logger.mylog('debug', result)
  return result
}

exports.updateAllCurrentProjectsEnvironmentsFromAPI = async () => {
  // mark all envs inactive and missing; then only found, active ones will be updated
  const sql = 'UPDATE environments SET active = 0, missing = 1'
  let result = db.prepare(sql).run()
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
  result = await Promise.all(promises)
  logger.mylog('info', `All ${promises.length} environments updated in DB with API data.`)
  return result
}

// need to delete from child first
// or how to warn if inactive parent & active child?
exports.deleteInactiveEnvironments = async () => {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    const cmd = `${MC_CLI} environment:delete -p ${project} --inactive --delete-branch --no-wait -y`
    promises.push(
      apiLimit(() => 
        exec(cmd)
          .then(execOutputHandler)
          .catch(error => {
            if (/No inactive environments found/.test(error.stderr)) { 
              // this should not be considered an error, but the CLI has a non-zero exit status
              // log the "error" for verbose mode and return
              logger.mylog('debug', error.stderr)
              return
            }
            logger.mylog('error', error)
          })
      )
    )
  })
  const result = await Promise.all(promises)
  logger.mylog('info', `All inactive environments in ${promises.length} projects scheduled for deletion.`)
  return result
}

exports.execInEnv = async (project, environment, filePath) => {
  const file = await exports.sendFileToRemoteTmpDir(project, environment, filePath)
  const remoteCmd = /\.sql$/.test(file)
    ? `mysql main -h database.internal < "${file}"`
    : `chmod +x "${file}"; "${file}"`
  const cmd = `${exports.getSshCmd(project, environment)} '${remoteCmd}'`
  return exec(cmd)
    .then(execOutputHandler)
    .then(() => logger.mylog('info', `File: ${filePath} executed in env: ${environment} of project: ${project}.`))
    .catch(error => logger.mylog('error', error))
}

const getMachineNameAndRegion = (project, environment) => {
  try {
    const sql = `SELECT machine_name, region FROM environments e LEFT JOIN projects p ON p.id = e.project_id 
      WHERE p.id = ? AND e.id = ?`
    const result = db.prepare(sql).get(project, environment)
    if (typeof result == 'undefined') {
      throw 'Row not found.'
    }
    logger.mylog('debug', result)
    return {machineName: result.machine_name, region: result.region}
  } catch (error) {
    logger.mylog('error',error)
  }
}

const getHostName = (project, environment) => {
  const {machineName, region} = getMachineNameAndRegion(project, environment)
  return `ssh ${machineName}-${project}.${region}.magentosite.cloud`
}

// Using this method instead of the built in `magento-cloud ssh ...` prevents token timeouts for ssh cmds
// When running cmds in parallel, if a cmd happens to execute when a token expires, all subsequent cmds
// will fail until the one that triggered a token renewal receives a new token
exports.getSshCmd = (project, environment) => {
  const {machineName, region} = getMachineNameAndRegion(project, environment)
  const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
  return `ssh ${project}-${machineName}--mymagento@${domain} -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes'`
}

exports.sendFileToRemoteTmpDir = async (project, environment, filePath) => {
  try {
    const {machineName, region} = getMachineNameAndRegion(project, environment)
    // create a unique remote tmp file
    const file = '/tmp/' + Math.floor(new Date() / 1000) + '-' + filePath.replace(/.*\//, '')
    const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
    const cmd = `scp -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${filePath} ${project}-${machineName}--mymagento@${domain}:${file}`
    await exec(cmd)
      .then(execOutputHandler)
      .then(() => logger.mylog('info', `File: ${filePath} transferred to: ${file} in remote env: ${environment} of project: ${project}.`))
    return file
  } catch (error) {
    logger.mylog('error', error)
  }
}

exports.getFileFromRemote = async (project, environment, filePath) => {
  const {machineName, region} = getMachineNameAndRegion(project, environment)
  const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
  const cmd = `mkdir -p "${project}-${environment}/${filePath}"
    scp -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${project}-${machineName}--mymagento@${domain}`
  return exec(cmd)
  .then(execOutputHandler)
  .then(() => logger.mylog('info', `File: ${filePath} transferred to: ${file} in env: ${environment} of project: ${project}.`))
}

