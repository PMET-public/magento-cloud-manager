const {exec, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')
const {setEnvironmentInactive} = require('./environment.js')

exports.updateApplicationState = function updateApplicationState(project, environment = 'master') {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    egrep -m 1 'magento/product-enterprise-edition\\":|\\"2\\.[0-9]\\.[0-9]\\.x-dev' composer.lock || echo 'not found'
    md5sum composer.lock
    stat -t composer.lock | awk '{print \\$12}'"`
  return exec(cmd)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      let [EEComposerVersion, composerLockMd5, composerLockMtime] = stdout.trim().split('\n')
      EEComposerVersion = EEComposerVersion.replace(/.*: "/, '').replace(/".*/, '')
      composerLockMd5 = composerLockMd5.replace(/ .*/, '')
      db
        .prepare(
          `INSERT INTO applications_states (project_id, environment_id, ee_composer_version, composer_lock_md5, composer_lock_mtime) 
        VALUES (?, ?, ?, ?, ?);`
        )
        .run(project, environment, EEComposerVersion, composerLockMd5, composerLockMtime)
    })
    .catch(error => {
      if (typeof error.stderr !== 'undefined' && /Specified environment not found/.test(error.stderr)) {
        return setEnvironmentInactive(project, environment)
      }
      logger.error(error)
    })
}

exports.updateAllApplicationsStates = async function updateAllApplicationsStates() {
  const promises = []
  db
    .prepare('SELECT id, project_id FROM environments WHERE active = 1')
    .all()
    .forEach(({id: environment, project_id: project}) => {
      promises.push(sshLimit(() => updateApplicationState(project, environment)))
    })
  return await Promise.all(promises)
}
