const https = require('https')
const {exec, execOutputHandler, db, MC_CLI, logger} = require('./common')
const {localCloudSshKeyPath} = require('../config.json')

const updateEnvironment = async (project, environment = 'master') => {
  const cmd = `${MC_CLI} environment:info -p "${project}" -e "${environment}" --format=tsv`
  const result = exec(cmd)
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
      if (/Specified environment not found/.test(error.message)) {
        const [prefix, project, environment] = error.cmd.match(/.* -p\s+"([^ ]+)"\s+-e\s"([^"]+)"/)
        return setEnvironmentMissing(project, environment)
      }
      logger.mylog('error', error)
    })
  return result
}
exports.updateEnvironment = updateEnvironment

exports.setEnvironmentInactive = (project, environment) => {
  const result = db
    .prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set to inactive.`)
  return result
}

exports.setEnvironmentFailure = (project, environment, value) => {
  const result = db
    .prepare('UPDATE environments SET failure = ?, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(value, project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set to failed.`)
  return result
}

const setEnvironmentMissing = (project, environment) => {
  const result = db
    .prepare('UPDATE environments SET missing = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set to missing.`)
  return result
}
exports.setEnvironmentMissing = setEnvironmentMissing

const deployEnvFromTar = async (project, environment, tarFile) => {
  // clone to nested tmp dir, discard all but the git dir and auth.json, mv git dir and tar file to parent dir
  // extract tar, commit, and push
  const cmd = `mkdir -p "/tmp/${project}-${environment}/tmp"
    ${MC_CLI} get -e ${environment} ${project} "/tmp/${project}-${environment}/tmp"
    mv "/tmp/${project}-${environment}/tmp/{.git,auth.json}" "${tarFile}" "/tmp/${project}-${environment}/"
    rm -rf "/tmp/${project}-${environment}/tmp"
    cd "/tmp/${project}-${environment}"
    tar -xf "${tarFile}"
    git add -u
    git add .
    git commit -m "commit from tar file"
    git push
    cd ..
    rm -rf "/tmp/${project}-${environment}"`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} deployed using ${tarFile}.`)
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.deployEnvFromTar = deployEnvFromTar

const redeployEnv = async (project, environment) => {
  const cmd = `${MC_CLI} redeploy -p ${project} -e ${environment} -y --no-wait`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} redeployed.`)
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.redeployEnv = redeployEnv

const getExpiringPidEnvs = () => {
  const expirationIn2Wks = new Date() / 1000 + 24 * 60 * 60 * 7 * 2
  const expiringPidEnvs = []
  getAllLiveEnvsFromDB().forEach(({project_id, environment_id, expiration}) => {
    if (expiration < expirationIn2Wks) {
      expiringPidEnvs.push(`${project_id}:${environment_id}`)
    }
  })
  return expiringPidEnvs
}
exports.getExpiringPidEnvs = getExpiringPidEnvs

const checkCertificate = async (project, environment = 'master') => {
  try {
    const hostName = await getHostName(project, environment)
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
    logger.mylog('info', `${result.host} expires on ${new Date(result.expiration * 1000).toDateString()}`)
    return result
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.checkCertificate = checkCertificate

const getEnvsFromApi = async project => {
  const cmd = `${MC_CLI} environments -p ${project} --pipe`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.getEnvsFromApi = getEnvsFromApi

const getAllLiveEnvsFromDB = () => {
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
exports.getAllLiveEnvsFromDB = getAllLiveEnvsFromDB

const getLiveEnvsAsPidEnvArr = () => {
  return getAllLiveEnvsFromDB().map( ({project_id, environment_id}) => `${project_id}:${environment_id}`)
}
exports.getLiveEnvsAsPidEnvArr = getLiveEnvsAsPidEnvArr

// need to delete from child first
// or how to warn if inactive parent & active child?
exports.deleteInactiveEnvs = async (project) => {
  const cmd = `${MC_CLI} environment:delete -p ${project} --inactive --delete-branch --no-wait -y`
  const result = exec(cmd)
    .then(execOutputHandler)
    .catch(error => {
      if (/No inactive environments found/.test(error.stderr)) {
        // this should not be considered an error, but the CLI has a non-zero exit status
        // log the "error" for verbose mode and return
        logger.mylog('debug', error.stderr)
        return true
      }
      logger.mylog('error', error)
    })
  return result
}

exports.deleteEnv = async (project, environment) => {
  if (environment === 'master') {
    logger.mylog('error', `Can not delete master env of project: ${project}`)
    return
  }
  const cmd = `${MC_CLI} environment:delete -p ${project} --no-wait -y`
  const result = exec(cmd)
    .then(execOutputHandler)
    .catch(error => {
      if (/No inactive environments found/.test(error.stderr)) {
        // this should not be considered an error, but the CLI has a non-zero exit status
        // log the "error" for verbose mode and return
        logger.mylog('debug', error.stderr)
        return true
      }
      logger.mylog('error', error)
    })
  return result
}


const execInEnv = async (project, environment, filePath) => {
  const file = await sendPathToRemoteTmpDir(project, environment, filePath)
  const remoteCmd = /\.sql$/.test(file)
    ? `mysql main -h database.internal < "${file}"`
    : `chmod +x "${file}"; "${file}"`
  const cmd = `${await getSshCmd(project, environment)} '${remoteCmd}'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      logger.mylog('info', `File: ${filePath} executed in env: ${environment} of project: ${project}.`)
      return true
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.execInEnv = execInEnv

const getMachineNameAndRegion = async (project, environment) => {
  try {
    const sql = `SELECT machine_name, region FROM environments e LEFT JOIN projects p ON p.id = e.project_id 
      WHERE p.id = ? AND e.id = ?`
    const result = db.prepare(sql).get(project, environment)
    if (typeof result == 'undefined') {
      // possibly requesting an environment that hasn't been queried yet, so attempt to update and then return
      const result = await updateEnvironment(project, environment)
      if (result) {
        return await getMachineNameAndRegion(project, environment)
      } else {
        throw `Project: ${project}, env: ${environment} not found.`
      }
    }
    logger.mylog('debug', result)
    return {machineName: result.machine_name, region: result.region}
  } catch (error) {
    logger.mylog('error', error)
  }
}

const getHostName = async (project, environment) => {
  const {machineName, region} = await getMachineNameAndRegion(project, environment)
  return `${machineName}-${project}.${region}.magentosite.cloud`
}

// Using this method instead of the built in `magento-cloud ssh ...` prevents token timeouts for ssh cmds
// When running cmds in parallel, if a cmd happens to execute when a token expires, all subsequent cmds
// will fail until the one that triggered a token renewal receives a new token
const getSshCmd = async (project, environment) => {
  try {
    const {machineName, region} = await getMachineNameAndRegion(project, environment)
    const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
    return `ssh ${project}-${machineName}--mymagento@${domain} -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes'`
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.getSshCmd = getSshCmd

const sendPathToRemoteTmpDir = async (project, environment, path) => {
  try {
    const {machineName, region} = await getMachineNameAndRegion(project, environment)
    // create a unique remote tmp file
    const file = '/tmp/' + Math.floor(new Date() / 1000) + '-' + path.replace(/.*\//, '')
    const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
    const cmd = `scp -r -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${path} ${project}-${machineName}--mymagento@${domain}:${file}`
    await exec(cmd)
      .then(execOutputHandler)
      .then(() =>
        logger.mylog(
          'info',
          `File: ${path} transferred to: ${file} in remote env: ${environment} of project: ${project}.`
        )
      )
    return file
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.sendPathToRemoteTmpDir = sendPathToRemoteTmpDir

const getPathFromRemote = async (project, environment, remotePath) => {
  try {
    remotePath = remotePath
      .replace(/^[~\.]/,'/app') // ~/ or ./ -> /app/
      .replace(/^\.\.\//,'/') // ../ -> /
      .replace(/^([^\/])/,'\/app\/$1') // anything-else -> /app/anything-else
      .replace(/\/$/, '')  // some-dir/ -> some-dir
    if (!remotePath) {
      throw `Invalid normalized path: "${remotePath}".`
    }
    const {machineName, region} = await getMachineNameAndRegion(project, environment)
    const domain = `ssh.${region}.magento${region === 'us-3' ? '' : 'site'}.cloud`
    const localDest = `./tmp/${project}-${environment}${remotePath.replace(/(.*\/)[^\/]*/,'$1')}`
    const cmd = `mkdir -p "${localDest}"
      scp -r -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${project}-${machineName}--mymagento@${domain}:${remotePath} ${localDest}`
    const result = exec(cmd)
      .then(execOutputHandler)
      .then(() => {
        logger.mylog('info', `Path: ${remotePath} of env: ${environment} of project: ${project} transferred to: ${localDest}.`)
        return true
      })
    return result
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.getPathFromRemote = getPathFromRemote