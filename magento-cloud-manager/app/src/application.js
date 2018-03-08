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
    SELECT COUNT(*) FROM sales_order;
    SELECT UNIX_TIMESTAMP(last_login_at) FROM customer_log ORDER BY last_login_at DESC limit 1;
    SELECT UNIX_TIMESTAMP(logdate) FROM admin_user ORDER BY logdate DESC limit 1;
  \\\""`
  return exec(cmd)
    .then(execOutputHandler)
    .then( stdout => {
      const [catalogProductEntityCount, catalogCategoryProductCount, adminUserCount, storeCount, orderCount, lastLoginCustomer, lastLoginAdmin] = stdout.trim().split('\n')
      const result = db
        .prepare(
          `INSERT INTO applications_db_checks
            (project_id, environment_id, catalog_product_entity_count, catalog_category_product_count, admin_user_count, store_count, order_count, last_login_customer, last_login_admin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(project, environment, catalogProductEntityCount, catalogCategoryProductCount, adminUserCount, storeCount, orderCount, lastLoginCustomer, lastLoginAdmin)
      logger.mylog('debug', result)
      return result
    })
    .catch(errorHandler)
}

exports.updateApplicationTest = (project, environment = 'master') => {
  // use curl -I for just headers using HTTP HEAD
  // use curl -sD - -o /dev/null  for headers (-D -: dump headers to stdout) using HTTP GET
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    http_status=$(curl -sI localhost | sed -n 's/HTTP\\/1.1 \\([0-9]*\).*/\\1/p')
    test $http_status -eq 302 || exit
    store_url=$(curl -sI localhost | sed -n 's/Location: \\(.*\\)?.*/\\1/p')
    cat_url=$(curl -s $base_url | perl -ne 's/.*?class.*?nav-1.*?href=.([^ ]+.html).*/\\1/ and print')
    cat_url_product_count=$(curl -s $category_url | grep 'img.*class.*product-image-photo' | wc -l)
    cat_url_cached=$(curl $category_url -o /dev/null -s -w '%{time_total}')
    store_url_cached=$(curl $store_url -o /dev/null -s -w '%{time_total}')
    php bin/magento cache:flush
    cat_url_uncached=$(curl $category_url -o /dev/null -s -w '%{time_total}')
    php bin/magento cache:flush
    store_url_uncached=$(curl $store_url -o /dev/null -s -w '%{time_total}')
    cat_url_partial_cache=$(curl $category_url -o /dev/null -s -w '%{time_total}')
    german_check=$(curl $store_url'?___store=luma_de&___from_store=default' -s | grep 'baseUrl.*de_DE' | wc -l)
    venia_check=$(curl $store_url'?___store=venia_us&___from_store=default' -s | grep 'baseUrl.*venia' | wc -l)
    read -r form_url form_key <<<$(curl -sL -c /tmp/myc -b /tmp/myc $store_url'/admin/' | perl -ne 's/.*var BASE_URL.*(https.*\\/).*/\\1/ and print;s/.*var FORM_KEY = .(.*).;.*/\\1/ and print')
    admin_check=$(curl -sv -c /tmp/myc -b /tmp/myc -X POST -d 'login[username]=admin&login[password]=admin4tls4&form_key='$form_key $form_url 2>&1 | grep 'Location.*admin/dashboard' | wc -l)
    echo http_status $http_status
    echo store_url $store_url
    echo cat_url $cat_url
    echo cat_url_product_count $cat_url_product_count
    echo cat_url_cached $cat_url_cached
    echo store_url_cached $store_url_cached
    echo cat_url_uncached $cat_url_uncached 
    echo store_url_uncached $store_url_uncached
    echo cat_url_partial_cache $cat_url_partial_cache
    echo german_check $german_check
    echo venia_check $venia_check
    echo admin_check $admin_check
"`
  return exec(cmd)
    .then(execOutputHandler)
    .then( stdout => {
      const [httpStatus, ...rest] = stdout.trim().split('\n')
      // const result = db
      //   .prepare(
      //     `INSERT INTO applications_db_checks
      //       (project_id, environment_id, catalog_product_entity_count, catalog_category_product_count, admin_user_count, store_count, order_count, last_login_customer, last_login_admin)
      //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      //   )
      //   .run(project, environment, catalogProductEntityCount, catalogCategoryProductCount, adminUserCount, storeCount, orderCount, lastLoginCustomer, lastLoginAdmin)
      // logger.mylog('debug', result)
      // return result
    })
    .catch(errorHandler)
}
