const {exec, execOutputHandler, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')
const {setEnvironmentInactive, getAllLiveEnvironmentsFromDB} = require('./environment.js')

const errorHandler = error => {
  logger.mylog('error', error)
  if (typeof error.stderr !== 'undefined') {
    if (/Specified environment not found/.test(error.stderr)) {
      setEnvironmentMissing(project, environment)
    } else if (/not currently active/.test(error.stderr)) {
      setEnvironmentInactive(project, environment)
    }
  }
}

exports.updateApplicationState = async (project, environment = 'master') => {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    egrep -m 1 'magento/product-enterprise-edition\\":|\\"2\\.[0-9]\\.[0-9]\\.x-dev|dev-2\\.[0-9]\\.[0-9]' composer.lock || echo 'not found'
    md5sum composer.lock
    stat -t composer.lock | awk '{print \\$12}'
    ps -p 1 -o %cpu --cumulative --no-header"`
  return exec(cmd)
    .then(execOutputHandler)
    .then( stdout => {
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
    .catch(errorHandler)
}

exports.updateAllApplicationsStates = async () => {
  const promises = []
  getAllLiveEnvironmentsFromDB().forEach(({id: environment, project_id: project}) => {
    promises.push(sshLimit(() => exports.updateApplicationState(project, environment)))
  })
  // possible issue if one promise fails?
  // https://stackoverflow.com/questions/30362733/handling-errors-in-promise-all
  return await Promise.all(promises)
}

exports.updateApplicationDbCheck = (project, environment = 'master') => {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
  mysql main -sN -h database.internal -e \\\"
    SELECT COUNT(*) FROM catalog_product_entity;
    SELECT COUNT(*) FROM catalog_category_product;
    SELECT COUNT(*) FROM admin_user;
    SELECT COUNT(*) FROM store;
    SELECT UNIX_TIMESTAMP(last_login_at) FROM customer_log ORDER BY last_login_at DESC limit 1;
    SELECT UNIX_TIMESTAMP(logdate) FROM admin_user ORDER BY logdate DESC limit 1;
  \\\""`
  return exec(cmd)
    .then(execOutputHandler)
    .then( stdout => {
      const [catalogProductEntityCount, catalogCategoryProductCount, adminUserCount, storeCount, lastLoginCustomer, lastLoginAdmin] = stdout.trim().split('\n')
      const result = db
        .prepare(
          `INSERT INTO applications_db_checks
            (project_id, environment_id, catalog_product_entity_count, catalog_category_product_count, admin_user_count, store_count, last_login_customer, last_login_admin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(project, environment, catalogProductEntityCount, catalogCategoryProductCount, adminUserCount, storeCount, lastLoginCustomer, lastLoginAdmin)
      logger.mylog('debug', result)
      return result
    })
    .catch(errorHandler)
}
