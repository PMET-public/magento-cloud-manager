const https = require('https')
const {exec, execOutputHandler, db, MC_CLI, logger, renderTmpl} = require('./common')
const {localCloudSshKeyPath} = require('../.secrets.json')

const updateEnvironmentFromApi = async (project, environment = 'master') => {
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
      const sql = `INSERT OR REPLACE INTO environments (id, project_id, title, machine_name, active, last_created_at, missing, failure) 
      VALUES (?, ?, ?, ?, ?, ?, 0,
        (SELECT failure FROM environments WHERE id = ? and project_id = ?)
      )`
      let result = db
        .prepare(sql)
        .run(environment, project, title, machineName, active, createdAt, environment, project)
      logger.mylog('debug', result)
      logger.mylog('info', `Env: ${environment} of project: ${project} updated.`)
      return result
    })
    .catch(error => {
      if (/Specified environment not found/.test(error.message)) {
        return setEnvironmentMissing(project, environment)
      } else if (/Specified project not found/.test(error.message)) {
        return require('./project').setProjectInactive(project)
      }
      logger.mylog('error', error)
    })
  return result
}
exports.updateEnvironmentFromApi = updateEnvironmentFromApi

const setEnvironmentInactive = (project, environment) => {
  const sql = 'UPDATE environments SET active = 0, timestamp = cast(strftime("%s",CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?' 
  const result = db.prepare(sql).run(project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set to inactive.`)
  return result
}
exports.setEnvironmentInactive = setEnvironmentInactive

const setEnvironmentFailure = (project, environment, value) => {
  const sql = 'UPDATE environments SET failure = ?, timestamp = cast(strftime("%s",CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?'
  const result = db.prepare(sql).run(value, project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set failure: ${value}.`)
  return result
}
exports.setEnvironmentFailure = setEnvironmentFailure

const setEnvironmentMissing = (project, environment) => {
  const sql = 'UPDATE environments SET missing = 1, timestamp = cast(strftime("%s",CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?'
  const result = db.prepare(sql).run(project, environment)
  logger.mylog('debug', result)
  if (result && result.changes) {
    logger.mylog('info', `Env: ${environment} of project: ${project} set to missing.`)
  }
  return result
}
exports.setEnvironmentMissing = setEnvironmentMissing

const resetEnv = async (project, environment) => {
  const remoteCmd = `mysql -h database.internal -e "drop database if exists main; 
  create database if not exists main default character set utf8;"; 
  # can not remove var/export so or noop cmd (|| :) in case it exists
  rm -rf ~/var/* ~/pub/media/* ~/app/etc/env.php ~/app/etc/config.php || :`
  const cmd = `${await getSshCmd(project, environment)} '${remoteCmd}'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} has been reset.`)
      return true
    })
    .catch(error => logger.mylog('error', error))
  return result
}

const deployEnvFromTar = async (project, environment, tarFile, reset = false, forceRebuildRedeploy = false) => {
  const basename = tarFile.replace(/.*\//, '')
  if (reset) {
    await resetEnv(project, environment)
  }
  // split the cmd into separate parts to trap STDERR output from `MC_CLI get` that is not actually error
  // clone to nested tmp dir, discard all but the git dir and auth.json, mv git dir and tar file to parent dir
  // extract tar, commit, and push
  const path = `/tmp/${project}-${environment}-${new Date()/1000}`
  const cmd = `mkdir -p "${path}"
    cd "${path}"
    ${MC_CLI} get --yes -e ${environment} ${project} tmp`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/InvalidArgumentException/.test(stderr)) {
        throw 'Project not found.'
      }
      // running cmds on wrong path could be bad, sanity test:
      if (!/\/.*[a-z0-9]{13}/.test(path)) {
        throw 'Invalid path.'
      }
      const cmd = `mv ${path}/tmp/{.git,auth.json} ${path} 2> /dev/null
        cp ${tarFile} ${path}
        rm -rf "${path}/tmp"
        cd "${path}"
        tar -xf "${basename}"
        rm "${basename}"
        git add -u
        git add .
        # special case: 1st time auth.json forcefully added b/c of .gitignore. subsequent runs have no affect
        git add -f auth.json
        git commit -m "commit from tar file"
        git push -f -u $(git remote) ${environment}`
      const result = exec(cmd)
        .then(execOutputHandler)
        .then(({stdout, stderr}) => {
          if (!stderr) {
            logger.mylog('info', `Env: ${environment} of project: ${project} deployed using ${tarFile}.`)
          } else if (/Everything up-to-date/.test(stderr) && forceRebuildRedeploy) {
            logger.mylog('error', 'Environment is up-to-date. Nothing to push.\n'+ 
            'Use the "--force" option to rebuild & deploy an env with a dummy ".redeploy" file.')
          }
          const cmd = `rm -rf "${path}"`
          const result = exec(cmd)
          return result
        })
      return result
    })
    .catch(error => {
      logger.mylog('error', error)
      return false
    })
  return result
}
exports.deployEnvFromTar = deployEnvFromTar


const rebuildAndRedeployUsingDummyFile = (project, environment) => {
  const epochTimeInSec = new Date()/1000
  const path = `/tmp/${project}-${environment}-${epochTimeInSec}`
  const cmd = `${MC_CLI} get --yes -e ${environment} ${project} "${path}"
    echo ${epochTimeInSec} > ${path}/.redeploy
    cd "${path}"
    git add -f .redeploy
    git commit -m "force rebuild & redeploy with .redeploy file"
    git push
    rm -rf "${path}"`
  const result = exec(cmd)
  return result
}
exports.rebuildAndRedeployUsingDummyFile = rebuildAndRedeployUsingDummyFile

const redeployEnv = async (project, environment) => {
  const cmd = `${MC_CLI} redeploy -p ${project} -e ${environment} -y --no-wait`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} redeployed.`)
      return true
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.redeployEnv = redeployEnv

const getExpiringPidEnvs = () => {
  const expirationIn2Wks = new Date() / 1000 + 24 * 60 * 60 * 7 * 2
  const expiringPidEnvs = []
  getAllLiveEnvsFromDB().forEach(({project_id, environment_id, expiration}) => {
    if (expiration && expiration < expirationIn2Wks) {
      expiringPidEnvs.push(`${project_id}:${environment_id}`)
    }
  })
  return expiringPidEnvs
}
exports.getExpiringPidEnvs = getExpiringPidEnvs

const checkExpired = response => {
  const certificateInfo = response.connection.getPeerCertificate()
  const expirationDate = new Date(certificateInfo.valid_to)
  const expirationSecs = Math.floor(expirationDate / 1000)
  const sql = `INSERT OR REPLACE INTO cert_expirations (host_name, expiration) 
    VALUES ('${response.connection.servername}', ${expirationSecs})`
  const result = db.prepare(sql).run()
  logger.mylog('debug', result)
  return expirationDate < new Date()
}
exports.checkExpired = checkExpired

const checkStatusCode = response => {
  const result = {
    logLevel: 'error',
    msg: 'Unaccounted for response.',
    updateEnvironmentFromApi: false
  }
  
  if (response.statusCode === 200) {
    result.logLevel = 'debug'
    result.msg = 'OK'
  } else if (response.statusCode === 403 || response.statusCode === 401) {
    result.logLevel = 'debug'
    result.msg = 'Unauthorized response. Public access has been disabled.'
  } else if (response.statusCode === 404) {
    if (response.headers['set-cookie']) { // storefront exists but returning 404
      result.msg = 'App found but returning 404.'
    } else {
      result.msg = 'App not found. Environment deleted?'
      result.updateEnvironmentFromApi = true
    }
  } 
  return result
}

const checkBody = response => {
  return new Promise((resolve, reject) => {
    const url = 'https://' + response.connection.servername
    let body = ''
    response.on('data', chunk => (body += chunk))
    response.on('end', () => {
      if (/baseUrl.*magentosite.cloud/.test(body)) {
        resolve(true) 
      } else {
        reject('Can not find base url in body for ' + url)
      }
    })
  }).catch(error => {
    logger.mylog('error', error)
  })
}

const checkPublicUrlForExpectedAppResponse = async (project, environment = 'master') => {
  const hostName = await getWebHostName(project, environment)
  const url = `https://${hostName}/`
  return await new Promise((resolve, reject) => {
    let request = https.request({host: hostName, port: 443, method: 'GET', rejectUnauthorized: false}, async response => {
      const isExpired = checkExpired(response)
      if (isExpired) {
        logger.mylog('error', `Expired. Project: ${project} env: ${environment} ${url}`)
      }
      const statusCodeResult = checkStatusCode(response)
      logger.mylog(
        statusCodeResult.logLevel,
        `Status: ${response.statusCode} ${statusCodeResult.msg} Project: ${project} env: ${environment} ${url}`
      )
      if (statusCodeResult.updateEnvironmentFromApi) {
        await updateEnvironmentFromApi(project, environment)
      }
      let bodyMatches = false
      if (response.statusCode === 200) {
        bodyMatches = await checkBody(response)
        if (bodyMatches) {
          logger.mylog('debug', `Response body matches base url. Project: ${project} env: ${environment} ${url}`)
        }
      }
      resolve(!isExpired && statusCodeResult.logLevel !== 'error' && bodyMatches)
    })
    // based on a report, request.abort was not a function in setTimeout when chained 
    // so break chaining as possible solution and ensure assignment completion first
    request.setTimeout(10000, () => {
      reject('Request timed out for ' + url)
      request.abort()
    }).on('error', (error) => {
      if (error.code !== 'ECONNRESET') { // don't log our intentional abort
        logger.mylog('error', error)
      }
    }).end()
  }).then(result => {
    if (result) {
      logger.mylog('info', `Public url returning expected app response. Project: ${project} env: ${environment} url: ${url}`)
      return result
    }
  }).catch(error => {
    logger.mylog('error', error)
  })
}
exports.checkPublicUrlForExpectedAppResponse = checkPublicUrlForExpectedAppResponse

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
      WHERE e.active = 1 AND p.active = 1 AND e.missing = 0 AND (e.failure = 0 OR e.failure IS null)`
  const result = db.prepare(sql).all()
  logger.mylog('debug', result)
  return result
}
exports.getAllLiveEnvsFromDB = getAllLiveEnvsFromDB

const getLiveEnvsAsPidEnvArr = () => {
  return getAllLiveEnvsFromDB().map(({project_id, environment_id}) => `${project_id}:${environment_id}`)
}
exports.getLiveEnvsAsPidEnvArr = getLiveEnvsAsPidEnvArr

// need to delete from child first
// or how to warn if inactive parent & active child?
const deleteInactiveEnvs = async project => {
  const cmd = `${MC_CLI} environment:delete -p ${project} --inactive --delete-branch --no-wait -y`
  const result = exec(cmd)
    .then(execOutputHandler)
    .catch(error => {
      if (/No inactive environments found|The master environment cannot be deleted/.test(error.stderr)) {
        // not real errors: 1) no inactive envs 2) master inactive b/c not initialized w/ app
        // log the "error" for verbose mode and return
        logger.mylog('debug', error.stderr)
        return true
      }
      logger.mylog('error', error)
    })
  return result
}
exports.deleteInactiveEnvs = deleteInactiveEnvs

const deleteEnv = async (project, environment) => {
  if (environment === 'master') {
    logger.mylog('error', `Can not delete master env of project: ${project}`)
    return
  }
  const cmd = `${MC_CLI} environment:delete -p ${project} -e ${environment} -q -y --delete-branch`
  const result = exec(cmd)
    .then(execOutputHandler)
    .catch(error => {
      if (/Specified environment not found/.test(error.message)) {
        setEnvironmentMissing(project, environment)
      }
      logger.mylog('error', error)
    })
  return result
}
exports.deleteEnv = deleteEnv

const branchEnvFromMaster = async (project, environment) => {
  const cmd = `${MC_CLI} branch -p ${project} -e master ${environment} --force`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return environment
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.branchEnvFromMaster = branchEnvFromMaster

const execInEnv = async (project, environment, filePath) => {
  try {
    if (/\.tmpl\./.test(filePath)) {
      filePath = renderTmpl(filePath)
    }
    const file = await sendPathToRemoteTmpDir(project, environment, filePath, 'debug')
    if (!file) {
      throw (`File could not be transferred to project: ${project} environment: ${environment}`)
    }
    const remoteCmd = /\.sql$/.test(file)
      ? `mysql main -vvv -h database.internal < "${file}"`
      : `chmod +x "${file}"; "${file}"`
    const cmd = `${await getSshCmd(project, environment)} '${remoteCmd}'`
    const result = exec(cmd)
      .then(execOutputHandler)
      .then(({stdout, stderr}) => {
        logger.mylog('info', `Project: ${project} env: ${environment} output of ${filePath}:\n${stdout.trim()}`)
        return true
      })
    return await result
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.execInEnv = execInEnv

const getMachineNameAndRegion = async (project, environment) => {
  try {
    const sql = `SELECT machine_name, region FROM environments e LEFT JOIN projects p ON p.id = e.project_id 
      WHERE p.id = ? AND e.id = ?`
    let result = db.prepare(sql).get(project, environment)
    if (typeof result === 'undefined') {
      // possibly requesting an environment that hasn't been queried yet, so attempt to update and then return
      result = await updateEnvironmentFromApi(project, environment)
      if (result && result.changes) {
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

const getWebHostName = async (project, environment) => {
  const {machineName, region} = await getMachineNameAndRegion(project, environment)
  return `${machineName}-${project}.${region}.magentosite.cloud`
}

const getSshUserAndHost = async (project, environment) => {
  const result = await getMachineNameAndRegion(project, environment)
  if (!result) {
    throw 'Could not find project and env in db'
  }
  const {machineName, region} = result
  return `${project}-${machineName}--mymagento@ssh.${region}.magento${region === 'us' ? 'site' : ''}.cloud`
}

// Using this method instead of the built in `magento-cloud ssh ...` prevents token timeouts for ssh cmds
// When running cmds in parallel, if a cmd happens to execute when a token expires, all subsequent cmds
// will fail until the one that triggered a token renewal receives a new token
const getSshCmd = async (project, environment) => {
  try {
    return `ssh ${await getSshUserAndHost(project, environment)} -i ${localCloudSshKeyPath} ` + 
      ' -o StrictHostKeyChecking=no -o IdentitiesOnly=yes'
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.getSshCmd = getSshCmd

const sendPathToRemoteTmpDir = async (project, environment, localPath, logLevel = 'info') => {
  try {
    // create a unique remote tmp file
    const file = '/tmp/' + Math.floor(new Date() / 1000) + '-' + localPath.replace(/.*\//, '')
    const cmd = `scp -r -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${localPath} ${await getSshUserAndHost(project, environment)}:${file}`
    await exec(cmd)
      .then(execOutputHandler)
      .then(() =>
        logger.mylog(
          logLevel,
          `File: ${localPath} transferred to: ${file} in remote env: ${environment} of project: ${project}.`
        )
      )
    return file
  } catch (error) {
    if (/you successfully connected, but the service/.test(error.message)) {
      setEnvironmentMissing(project, environment)
    }
    logger.mylog('error', error)
  }
}
exports.sendPathToRemoteTmpDir = sendPathToRemoteTmpDir

const getPathFromRemote = async (project, environment, remotePath) => {
  try {
    remotePath = remotePath
      .replace(/^[~.]/, '/app') // ~/ or ./ -> /app/
      .replace(/^\.\.\//, '/') // ../ -> /
      .replace(/^([^/])/, '/app/$1') // anything-else -> /app/anything-else
      .replace(/\/$/, '') // some-dir/ -> some-dir
    if (!remotePath) {
      throw `Invalid normalized path: "${remotePath}".`
    }
    const localDest = `./tmp/${project}-${environment}${remotePath.replace(/(.*\/)[^/]*/, '$1')}`
    const cmd = `mkdir -p "${localDest}"
      scp -r -i ${localCloudSshKeyPath} -o 'IdentitiesOnly=yes' ${await getSshUserAndHost(project, environment)}:${remotePath} ${localDest}`
    const result = exec(cmd)
      .then(execOutputHandler)
      .then(() => {
        logger.mylog(
          'info',
          `Path: ${remotePath} of env: ${environment} of project: ${project} transferred to: ${localDest}.`
        )
        return true
      })
    return await result
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.getPathFromRemote = getPathFromRemote

const backup = async (project, environment) => {
  const sshCmd = await getSshCmd(project, environment)
  // backup the composer file, the envionment specific media (what's different from master), and the database
  const cmd = `${sshCmd} '
    tarfile=/tmp/$(date "+%y-%m-%d-%H-%M")-${project}-${environment}-backup.tar
    sqlfile=$(php ~/bin/magento setup:backup --db | sed -n "s/.*path: //p")
    # replace specific host name with token placeholder
    perl -i -pe "\\$c+=s/${await getWebHostName(project, environment)}/{{REPLACEMENT_BASE_URL}}/g; 
      END{print \\"\\n\\$c host name replacements\\n\\"}" $sqlfile
    # ssh into environment and from there rsync (compare) to master (as remote) since can not rsync using 2 remotes
    rsync --dry-run --progress -rz --size-only --exclude "catalog/product/cache" \
    /app/pub/media/ ${await getSshUserAndHost(project, 'master')}:/app/pub/media/ 2> /dev/null | sed "1d;
    s/^/\\/app\\/pub\\/media\\//" | tar -cf $tarfile --files-from -
    tar -rf $tarfile $sqlfile /app/composer.json /app/composer.lock /app/.magento.app.yaml
    echo tarfile $tarfile'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      console.log(stdout, stderr)
      getPathFromRemote(project, environment, stdout.replace(/[\s\S*]tarfile (.*)/,'$1'))
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.backup = backup

const restore = async (project, environment, localPath) => {
  const remoteTar = await sendPathToRemoteTmpDir(project, environment, localPath)
  const sshCmd = await getSshCmd(project, environment)
  const cmd = `${sshCmd} '
  # extract all but filter basename of sql file
  sqlfile=$(tar -C /app -xf ${remoteTar} | sed -n "/db.sql/ s/.*\\///p")
  perl -i -pe "\\$c+=s/{{REPLACEMENT_BASE_URL}}/${await getWebHostName(project, environment)}/g; 
    END{print \\"\\n\\$c host name replacements\\n\\"}" $sqlfile
  php bin/magento setup:rollback -n -d $sqlfile
  '`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      console.log(stdout, stderr)
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.restore = restore
