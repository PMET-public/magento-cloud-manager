const https = require('https')
const {exec, execOutputHandler, db, MC_CLI, logger, renderTmpl} = require('./common')
const {localCloudSshKeyPath, nets_json} = require('../.secrets.json')

const sortEEVersion = (a,b) => {
  if (a.ee_composer_version === null && b.ee_composer_version !== null) {
    return -1
  } else if (a.ee_composer_version !== null && b.ee_composer_version === null) {
    return 1
  } else if (a.ee_composer_version === b.ee_composer_version) {
    return 0
  } else if (a.ee_composer_version < b.ee_composer_version) {
    return -1
  }
  return 1
}

const updateEnvironmentFromApi = async (project, environment = 'master') => {
  const cmd = `${MC_CLI} environment:info -p "${project}" -e "${environment}" --format=tsv`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const title = stdout.replace(/[\s\S]*title\s*([^\r\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const machineName = stdout.replace(/[\s\S]*machine_name\s*([^\r\n]+)[\s\S]*/, '$1').replace(/"/g, '')
      const active = /\nstatus\s+(active|dirty)/.test(stdout) ? 1 : 0
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      // be careful to preserve 'failure' and 'branch_level' on existing envs when using INSERT OR REPLACE
      // REPLACE is essentially deletion followed by insertion
      // however if the MC_CLI cmd succeeded the env is not missing (0)
      const sql = `INSERT OR REPLACE INTO environments (id, project_id, title, machine_name, active, last_created_at, missing, failure, branch_level) 
      VALUES (?, ?, ?, ?, ?, ?, 0,
        (SELECT failure FROM environments WHERE id = ? and project_id = ?),
        (SELECT branch_level FROM environments WHERE id = ? and project_id = ?)
      )`
      let result = db
        .prepare(sql)
        .run(environment, project, title, machineName, active, createdAt, environment, project, environment, project)
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

const setEnvironmentBranchLevel = (project, environment, value) => {
  const sql = "UPDATE environments SET branch_level = ?, timestamp = cast(strftime('%s', CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?"
  const result = db.prepare(sql).run(value, project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set branch level: ${value}.`)
  return result
}
exports.setEnvironmentBranchLevel = setEnvironmentBranchLevel

const setEnvironmentInactive = (project, environment) => {
  const sql = "UPDATE environments SET active = 0, timestamp = cast(strftime('%s', CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?"
  const result = db.prepare(sql).run(project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set to inactive.`)
  return result
}
exports.setEnvironmentInactive = setEnvironmentInactive

const setEnvironmentFailure = (project, environment, value) => {
  const sql = "UPDATE environments SET failure = ?, timestamp = cast(strftime('%s', CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?"
  const result = db.prepare(sql).run(value, project, environment)
  logger.mylog('debug', result)
  logger.mylog('info', `Env: ${environment} of project: ${project} set failure: ${value}.`)
  return result
}
exports.setEnvironmentFailure = setEnvironmentFailure

const setEnvironmentMissing = (project, environment, missing = 1) => {
  const sql = "UPDATE environments SET missing = ?, timestamp = cast(strftime('%s', CURRENT_TIMESTAMP) as int) WHERE project_id = ? AND id = ?"
  const result = db.prepare(sql).run(missing, project, environment)
  logger.mylog('debug', result)
  if (result && result.changes) {
    logger.mylog('info', `Env: ${environment} of project: ${project} set to missing: ${missing}.`)
  }
  return result
}
exports.setEnvironmentMissing = setEnvironmentMissing

const resetEnv = async (project, environment) => {
  const remoteCmd = `mysql -h database.internal -e "drop database if exists main; 
  create database if not exists main default character set utf8;"; 
  # can not remove var/export so or noop cmd (|| :) in case it exists
  rm -rf ~/pub/media/* ~/app/etc/* ~/var/.* ~/var/* || :`
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

const deployEnvWithFile = async (project, environment, file, reset = false, forceRebuildRedeploy = false) => {
  const basename = file.replace(/.*\//, '')
  if (reset) {
    await resetEnv(project, environment)
  }
  // split the cmd into separate parts to trap STDERR output from `MC_CLI get` that is not actually error
  // clone to nested tmp dir, discard all but the git dir and auth.json, mv git dir and file to parent dir
  // if tar, extract tar
  // if sh script, execute
  // commit, and push
  const path = `/tmp/${project}-${environment}-${new Date()/1000}`
  const cmd = `mkdir -p "${path}"
    cd "${path}"
    ${MC_CLI} get --yes -e "${environment}" "${project}" tmp`
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
      let cmd = ''
      if (/\.tar$/i.test(basename)) {
        cmd += `
        mv ${path}/tmp/.git ${path} || :
        [[ -f "${path}/tmp/auth.json" ]] && mv ${path}/tmp/auth.json ${path}
        rm -rf "${path}/tmp"
        `
      } else {
        cmd += `mv ${path}/tmp/* ${path}/tmp/.* ${path}/\n`
      }
      cmd += `
        cp ${file} ${path}
        cd "${path}"
        ${/\.tar$/i.test(basename) ? 'tar -xf ' + basename : './' + basename }
        rm "${basename}"
        # flush the cache prevents errors on startup of the next package
        `
      // ssh syntax will vary if using a token
      if (process.env.MAGENTO_CLOUD_CLI_TOKEN) {
        cmd += `${MC_CLI} ssh -p "${project}" -e "${environment}"`
      } else {
        cmd += `ssh -n $(${MC_CLI} ssh -p "${project}" -e "${environment}" --pipe)`
      }
      cmd += ` "php bin/magento cache:flush; { for i in {1..30}; do pkill php; sleep 60; done; } &>/dev/null &"
        git add -u
        git add .
        [[ -f auth.json ]] && rm auth.json && git rm auth.json
        git commit -m "commit using ${basename}"
        git branch -u $(git remote)/${environment}
      `
      if (process.env.MAGENTO_CLOUD_CLI_TOKEN) {
        cmd += `${MC_CLI} push -y`
      } else {
        cmd += `git push -f $(git remote) HEAD:${environment}`
      }
      const result = exec(cmd)
        .then(execOutputHandler)
        .then(({stdout, stderr}) => {
          if (!stderr) {
            logger.mylog('info', `Env: ${environment} of project: ${project} deployed using ${file}.`)
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
exports.deployEnvWithFile = deployEnvWithFile

const rebuildAndRedeployUsingDummyFile = async (project, environment, file, reset = false) => {
  if (reset) {
    await resetEnv(project, environment)
  }
  const epochTimeInSec = new Date()/1000
  const path = `/tmp/${project}-${environment}-${epochTimeInSec}`
  const cmd = `${MC_CLI} get --yes -e "${environment}" "${project}" "${path}"
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
  const cmd = `${MC_CLI} redeploy -p "${project}" -e "${environment}" -y --no-wait`
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

const syncEnv = async (project, environment, syncData = false) => {
  const cmd = `${MC_CLI} sync code ${syncData ? 'data' : ''} -p "${project}" -e "${environment}" -y --no-wait`
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
exports.syncEnv = syncEnv

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

const setIPAccess = async (project, environment) => {
  const nowInMs = (new Date()).getTime()
  const networks = nets_json.networks.filter(a => Date.parse(a.available_until) > nowInMs).sort((a,b) => a.address > b.address ? 1 : -1)
  let network_opts = `--auth admin:${project}`
  networks.forEach(n => network_opts += ` --access allow:${n.address}/${n.mask}`)

  const cmd = `${MC_CLI} httpaccess -p "${project}" -e "${environment}" --no-wait ${network_opts} --access deny:any`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      if (/Failed to identify project/.test(stderr)) {
        throw 'Project not found.'
      }
      logger.mylog('info', `Env: ${environment} of project: ${project} (re)set IP access.`)
      return true
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.setIPAccess = setIPAccess

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
  const url = `https://admin:${project}@${hostName}/`
  return await new Promise((resolve, reject) => {
    let request = https.request({host: hostName, port: 443, method: 'GET', rejectUnauthorized: false, auth: `admin:${project}`}, async response => {
      const certificateInfo = response.connection.getPeerCertificate()
      const expirationDate = new Date(certificateInfo.valid_to)
      const expirationSecs = Math.floor(expirationDate / 1000)
      const isExpired = expirationDate < new Date()
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

      const sql = `INSERT OR REPLACE INTO web_statuses (host_name, expiration, http_status, base_url_found_in_headers_or_body, timeout) 
        VALUES ('${hostName}', ${expirationSecs}, ${response.statusCode}, 
          ${bodyMatches ? '1' : '0'},
          0)`
      const result = db.prepare(sql).run()
      logger.mylog('debug', result)

      resolve(!isExpired && statusCodeResult.logLevel !== 'error' && bodyMatches)
    })
    // based on a report, request.abort was not a function in setTimeout when chained 
    // so break chaining as possible solution and ensure assignment completion first
    request.setTimeout(30000, () => {

      const sql = `INSERT OR REPLACE INTO web_statuses (host_name, expiration, http_status, base_url_found_in_headers_or_body, timeout) 
        VALUES ('${hostName}', 
          (SELECT expiration FROM web_statuses WHERE host_name = '${hostName}'),
          null, 0, 1)`
      const result = db.prepare(sql).run()
      logger.mylog('debug', result)

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

const reportWebStatuses = () => {
  const sql = `SELECT a.ee_composer_version,  e.id environment_id, e.project_id, p.title, w.*
    FROM environments e 
    LEFT JOIN projects p ON 
      e.project_id = p.id
    LEFT JOIN web_statuses w ON 
      w.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
    LEFT JOIN applications a ON
      e.project_id = a.project_id AND 
      e.id = a.environment_id
    WHERE e.active = 1 
      AND p.active = 1 
      AND e.missing = 0 
      AND (e.failure = 0 OR e.failure IS null)
    ORDER BY w.http_status`
  const result = db.prepare(sql).all()
  let nextHttpStatus = false,
    numUnexpectedResponses = 0,
    envs = {
      "Expired": [],
      "No Base Url": [],
      "Timed Out" : []
    }
  for (let i = 0; i < result.length; i++) {
    // check if env expired
    if (Math.floor(new Date() / 1000) > result[i].expiration) {
      envs.Expired.push(result[i])
    } else if (result[i].http_status === null) {
        envs["Timed Out"].push(result[i])
    } else if (result[i].http_status === 200) {
      if (result[i].base_url_found_in_headers_or_body === 0) {
        envs["No Base Url"].push(result[i])
      } else {
        continue // 200 w/ base url is expected
      }
    } else {
      if (typeof envs[result[i].http_status] === 'undefined') {
        envs[result[i].http_status] = []
      }
      envs[result[i].http_status].push(result[i])
    }
    numUnexpectedResponses++
  }
  Object.entries(envs).map(([key, value]) => {
    if (!value.length) {
      return
    }
    console.log(`\n${key} envs: ${value.length} total`)
    let urls = '',
      listOfEnvs = ''
    value.sort(sortEEVersion)
    value.forEach(r => {
      urls += `\`${r.ee_composer_version ? r.ee_composer_version.padStart(8, ' ') : '     n/a'}\` ` +
      `| <https://demo.magento.cloud/projects/${r.project_id}/environments/${r.environment_id}|cloud> ` +
      `| <https://admin:${r.project_id}@${r.host_name}|store> ` +
      `| <https://admin:${r.project_id}@${r.host_name}/admin/|admin> ` +
      `| ${r.title} | ${r.project_id}:${r.environment_id}\n`
      listOfEnvs += `"${r.project_id}:${r.environment_id}" `
    })
    console.log(`${urls}\`${listOfEnvs}\``)
  })
  console.log(`\nThere are ${numUnexpectedResponses} unexpected responses.`)
}
exports.reportWebStatuses = reportWebStatuses

const getEnvsFromApi = async project => {
  const cmd = `${MC_CLI} environments -p "${project}" --pipe`
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
  const sql = `SELECT e.id environment_id, e.project_id, w.expiration
    FROM environments e 
    LEFT JOIN projects p ON e.project_id = p.id
    LEFT JOIN web_statuses w ON 
      w.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
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
  const cmd = `${MC_CLI} environment:delete -p "${project}" --inactive --delete-branch --no-wait -y`
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
  // kill any php process up to 10 times in the next 10 min
  // that may still be running and blocking a proper shutdown before deleting
  const cmd = `ssh -n $(${MC_CLI} ssh -p "${project}" -e "${environment}" --pipe) 'for i in {1..10}; do pkill php; sleep 60; done' &
    ${MC_CLI} environment:delete -p "${project}" -e "${environment}" -q -y --delete-branch`
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
  const cmd = `${MC_CLI} branch -p "${project}" -e master "${environment}" --force`
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
    // verify project exists first & error if not
    // we can not directly query and update project for now 
    // w/o creating a circulary dependency between project.js <-> environment.js
    let sql = 'SELECT id FROM projects p where p.id = ?'
    let result = db.prepare(sql).get(project)
    if (typeof result === 'undefined') {
      throw `Project: ${project} not found. Please run project:update [pid] cmd first.`
    }
    sql = `SELECT machine_name, region FROM environments e LEFT JOIN projects p ON p.id = e.project_id 
      WHERE p.id = ? AND e.id = ?`
    result = db.prepare(sql).get(project, environment)
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
  const cmd = `${MC_CLI} ssh -p "${project}" -e "${environment}" --pipe`
  const result = await exec(cmd)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      if (/An API error occurred./.test(stderr)) {
        throw 'An API error occurred.'
      }
      return stdout.trim()
    })
  return result
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
      //console.log(stdout, stderr)
      getPathFromRemote(project, environment, stdout.replace(/[\s\S]*tarfile (.*)/,'$1').trim())
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
      //console.log(stdout, stderr)
    })
    .catch(error => {
      logger.mylog('error', error)
    })
  return result
}
exports.restore = restore
