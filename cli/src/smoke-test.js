const {exec, execOutputHandler, db, logger, parseFormattedCmdOutputIntoDB} = require('./common')
const {execInEnv, setEnvironmentMissing, setEnvironmentInactive, getSshCmd, checkPublicUrlForExpectedAppResponse} = require('./environment.js')
const {defaultCloudVars, magentoSIAdminUser, magentoSIAdminPassword} = require('../.secrets.json')

const smokeTestApp = async (project, environment = 'master') => {
  const sshCmd = await getSshCmd(project, environment)
  if (typeof sshCmd === 'undefined') {
    return
  }

  logger.mylog('info', `Before smoke test, ensure SI admin user exists in env: ${environment} of project: ${project}.`)
  await execInEnv(project, environment, `${__dirname}/../bin/env-scripts/add-separate-admin-user.tmpl.sh`)

  const cmd = `${sshCmd} '
    # utilization based on the 1, 5, & 15 min load avg and # cpu at the start
    echo utilization_start $(perl -e "printf \\"%.0f,%.0f,%.0f\\", $(cat /proc/loadavg | 
      sed "s/ [0-9]*\\/.*//;s/\\(\\...\\)/\\1*100\\/$(nproc),/g;s/.$//")")
    echo cumulative_cpu_percent $(ps -p 1 -o %cpu --cumulative --no-header)
    echo cpus $(nproc)

    # sort based on the 3 field to rev output to keep most recent occurrence of error only
    # do a final sort and remove benign errors
    echo error_logs $( { perl -lne "/.*?\\":\\"(.*?)\\",\\".*/ and print((stat(\\$ARGV))[9] . 
    \\" \\" . \\$ARGV . \\" \\" . \\"\\$1\\")" ~/var/report/* 2> /dev/null ; perl -MDate::Parse=str2time -lne "
    /\\[([^]]*)].*(CRITICAL|ERROR):? (.*)/ and print(str2time(\\$1) . \\" \\" . \\$ARGV . \\" \\" . \\$2 .\\" \\" . 
    \\$3)" ~/var/log/{debug,exception,support_report,system}.log \
    /var/log/{app,deploy,error}.log 2> /dev/null ; } | sort -k 3 -ru )
    echo last_deploy_log $(ls app/etc/log/cloud.*.log 2> /dev/null | tail -1 | xargs tail | tr "\\n" "\\v")

    mysql main -sN -h database.internal -e "
      SELECT \\"not_valid_index_count\\", COUNT(*) FROM indexer_state WHERE status != \\"valid\\";
      SELECT \\"catalog_product_entity_count\\", COUNT(*) FROM catalog_product_entity;
      SELECT \\"catalog_category_product_count\\", COUNT(*) FROM catalog_category_product;
      SELECT \\"admin_user_count\\", COUNT(*) FROM admin_user;
      SELECT \\"store_count\\", COUNT(*) FROM store;
      SELECT \\"order_count\\", COUNT(*) FROM sales_order;
      SELECT \\"cms_block_count\\", COUNT(*) FROM cms_block;
      SELECT \\"last_login_customer\\", UNIX_TIMESTAMP(last_login_at) FROM customer_log 
        ORDER BY last_login_at DESC limit 1;
      SELECT \\"last_login_admin\\", UNIX_TIMESTAMP(logdate) FROM admin_user WHERE username != \\"${magentoSIAdminUser}\\"
        ORDER BY logdate DESC limit 1;
    "

    last_cron_success=$(perl -0777 -ne "/[\\S\\s]*\\n\\[([^.]+)[\\S\\s]*Ran jobs by schedule/ and print \\$1" /var/log/cron.log)
    echo last_cron_success $(test -z "$last_cron_success" && echo NULL ||  date --date="$last_cron_success" +%s)

    # use curl -I for just headers using HTTP HEAD
    # use curl -sD - -o /dev/null  for headers (-D -: dump headers to stdout) using HTTP GET
    localhost_http_status=$(curl -sI localhost | sed -n "s/HTTP\\/1.1 \\([0-9]*\\).*/\\1/p")
    echo localhost_http_status $localhost_http_status

    # --- any value below can be NULL in the DB b/c we exit on invalid responses from the web server ---
    test $localhost_http_status -eq 302 || exit 0
    store_url=$(curl -sI localhost | sed -n "s/Location: \\(.*\\)?.*/\\1/p")
    store_html=$(curl -s $store_url)
    echo store_url_cached $(curl $store_url -o /dev/null -s -w "%{time_total}")

    echo german_check $(curl "$store_url?___store=luma_de&___from_store=default" -s | grep " \\"baseUrl.*de_DE" | wc -l)
    echo venia_check $(curl "$store_url?___store=venia_us&___from_store=default" -s | grep " \\"baseUrl.*venia" | wc -l)
    php bin/magento admin:user:unlock ${magentoSIAdminUser} > /dev/null
    rm /tmp/myc 2> /dev/null || : 
    read -r form_url form_key <<<$(curl -sL -c /tmp/myc -b /tmp/myc "$store_url/admin/" | 
      perl -ne "chomp; s/.*var BASE_URL.*(https.*\\/).*/\\1 / and print;s/.*var FORM_KEY = .(.*).;.*/\\1/ and print")
    echo admin_check $(curl -sLv --max-redirs 1 -c /tmp/myc -b /tmp/myc -X POST -d \
      "login[username]=${magentoSIAdminUser}&login[password]=${magentoSIAdminPassword}&form_key=$form_key" $form_url 2>&1 |
      grep -i -m 1 "Location.*admin/dashboard" | wc -l)

    cat_url=$(curl -s $store_url | perl -ne "s/.*?class.*?nav-[12]-1.*?href=.([^ ]+.html).*/\\1/ and print")
    if [ -n "$cat_url" ]; then
      echo cat_url $cat_url
      echo cat_url_product_count $(curl -s $cat_url | grep "src=.*product/cache" | wc -l)
      echo cat_url_cached $(curl $cat_url -o /dev/null -s -w "%{time_total}")
      php bin/magento cache:flush > /dev/null
      echo cat_url_uncached $(curl $cat_url -o /dev/null -s -w "%{time_total}")
    fi

    php bin/magento cache:flush > /dev/null
    echo store_url_uncached $(curl $store_url -o /dev/null -s -w "%{time_total}")
    search_url="\${store_url}catalogsearch/result/?q=accessory"
    echo search_url $search_url
    echo search_url_partial_cache $(curl $search_url -o /dev/null -s -w "%{time_total}")
    echo search_url_product_count $(curl -s $search_url | grep "src=.*product/cache" | wc -l)

    if [ -n "$cat_url" ]; then
      echo cat_url_partial_cache $(curl $cat_url -o /dev/null -s -w "%{time_total}")
    fi

    echo utilization_end $(perl -e "printf \\"%.0f,%.0f,%.0f\\", $(cat /proc/loadavg | 
      sed "s/ [0-9]*\\/.*//;s/\\(\\...\\)/\\1*100\\/$(nproc),/g;s/.$//")")
  '`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      parseFormattedCmdOutputIntoDB(stdout, 'smoke_tests', false, ['project_id', 'environment_id'], [project, environment])
      logger.mylog('info', `Smoke test of env: ${environment} of project: ${project} completed.`)
      return true
    })
    .then(() => checkPublicUrlForExpectedAppResponse(project, environment))
    .catch(error => {
      if (typeof error.stderr !== 'undefined') {
        if (/Specified environment not found|you successfully connected, but the service/.test(error.stderr)) {
          setEnvironmentMissing(project, environment)
        } else if (/not currently active/.test(error.stderr)) {
          setEnvironmentInactive(project, environment)
        }
      }
      logger.mylog('error', error.stderr || error.message)
    })
  return await result
}
exports.smokeTestApp = smokeTestApp

const checkAppVersion = async (project, environment = 'master') => {
  const sshCmd = await getSshCmd(project, environment)
  if (typeof sshCmd === 'undefined') {
    return
  }

  const cmd = `${sshCmd} '
    echo app_yaml_md5 $(md5sum .magento.app.yaml | sed "s/ .*//")
    echo ee_composer_version $(perl -ne "
        s/.*magento\\/product-enterprise-edition.*:.*?\\"([^\\"]+)\\".*/\\1/ and print;
        s/.*magento-product-enterprise-edition-(2\\.[0-9]+\\.[0-9]+).*/\\1/ and print;
      " composer.lock | head -1)
    echo composer_lock_md5 $(md5sum composer.lock | sed "s/ .*//")
    echo config_php_md5 $(md5sum app/etc/config.php | sed "s/ .*//")
  '`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      parseFormattedCmdOutputIntoDB(stdout, 'applications', true, ['project_id', 'environment_id'], [project, environment])
      logger.mylog('info', `Check app version of env: ${environment} of project: ${project} completed.`)
      return true
    })
    .catch(error => {
      if (typeof error.stderr !== 'undefined') {
        if (/Specified environment not found|you successfully connected, but the service/.test(error.stderr)) {
          setEnvironmentMissing(project, environment)
        } else if (/not currently active/.test(error.stderr)) {
          setEnvironmentInactive(project, environment)
        }
      }
      logger.mylog('error', error.stderr || error.message)
    })
  return await result
}
exports.checkAppVersion = checkAppVersion

const getUntestedEnvs = () => {
  // live envs w/o entries in smoke_tests
  const sql = `SELECT e.project_id || ':' || e.id proj_env_id FROM
  (SELECT *
    FROM environments e 
    LEFT JOIN projects p ON e.project_id = p.id
    WHERE e.active = 1 AND p.active = 1 AND e.missing = 0 AND (e.failure = 0 OR e.failure IS NULL)) e
  LEFT JOIN smoke_tests s ON e.id = s.environment_id AND e.project_id = s.project_id 
  WHERE s.id IS NULL`
  const result = db
    .prepare(sql)
    .all()
    .map(row => row.proj_env_id)
  logger.mylog('debug', result)
  return result
}
exports.getUntestedEnvs = getUntestedEnvs
