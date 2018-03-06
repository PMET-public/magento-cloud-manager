const {exec, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')
const {setEnvironmentInactive} = require('./environment.js')

exports.updateApplicationState = function(project, environment = 'master') {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    egrep -m 1 'magento/product-enterprise-edition\\":|\\"2\\.[0-9]\\.[0-9]\\.x-dev|dev-2\\.[0-9]\\.[0-9]' composer.lock || echo 'not found'
    md5sum composer.lock
    stat -t composer.lock | awk '{print \\$12}'
    ps -p 1 -o %cpu --cumulative --no-header"`
  return exec(cmd)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      logger.mylog('info', stdout)
      let [EEComposerVersion, composerLockMd5, composerLockMtime, cumulativeCpuPercent] = stdout.trim().split('\n')
      EEComposerVersion = EEComposerVersion.replace(/.*: "/, '').replace(/".*/, '')
      composerLockMd5 = composerLockMd5.replace(/ .*/, '')
      cumulativeCpuPercent = cumulativeCpuPercent.trim()
      const result = db
        .prepare(
          `INSERT INTO applications_states 
            (project_id, environment_id, ee_composer_version, composer_lock_md5, composer_lock_mtime, cumulative_cpu_percent)
          VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(project, environment, EEComposerVersion, composerLockMd5, composerLockMtime, cumulativeCpuPercent)
      logger.mylog('debug', result)
      return result
    })
    .catch(error => {
      logger.mylog('error', error)
      if (typeof error.stderr !== 'undefined') {
        if (/Specified environment not found/.test(error.stderr)) {
          setEnvironmentMissing(project, environment)
        } else if (/not currently active/.test(error.stderr)) {
          setEnvironmentInactive(project, environment)
        }
      }
    })
}

exports.updateAllApplicationsStates = async function() {
  const promises = []
  const result = db
    .prepare(
      `SELECT id, project_id FROM environments WHERE active = 1 AND (failure = 0 OR failure IS null)`
    )
    .all()
  logger.mylog('debug', result)

  result.forEach(({id: environment, project_id: project}) => {
    promises.push(sshLimit(() => exports.updateApplicationState(project, environment)))
  })
  // possible issue if one promise fails?
  // https://stackoverflow.com/questions/30362733/handling-errors-in-promise-all
  return await Promise.all(promises)
}
