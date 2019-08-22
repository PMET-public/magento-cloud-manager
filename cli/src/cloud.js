const {db, logger, fetch} = require('./common')
const md5 = require('md5')

const generateCss = async () => {

  const tags = ['ref-RC', 'ref-GA', 'demo-RC', 'demo-GA', 'b2b-RC', 'b2b-GA', 'pwa-RC', 'pwa-GA']
  const files = [ 
    {path: '.magento.app.yaml', col: 'app_yaml_md5'},
    {path: 'composer.lock', col: 'composer_lock_md5'},
    {path: 'app/etc/config.php', col: 'config_php_md5'}
  ]
  const md5s = {}
  const promises = []

  tags.forEach( tag => {
    files.forEach( file => {
      const url = `https://raw.githubusercontent.com/PMET-public/magento-cloud/${tag}/${file.path}`
      promises.push(
        fetch(url)
          .then(res => res.text())
          .then(body => md5s[url] = md5(body))
          .catch(error => logger.mylog('error', error))
      )
    })
  })

  const result = await Promise.all(promises)
  logger.mylog('debug', result)

  const sql = `SELECT a.project_id, a.environment_id, w.expiration, w.http_status, w.base_url_found_in_headers_or_body base_url_found, 
      w.timeout, w.timestamp web_timestamp,
      a.ee_composer_version, a.app_yaml_md5, a.composer_lock_md5, a.config_php_md5, a.timestamp version_timestamp
    FROM applications a, environments e, projects p
    LEFT JOIN web_statuses w ON 
        w.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
    WHERE p.active = 1
      and p.region = 'demo'
      and p.id = e.project_id
      and p.id = a.project_id 
      and e.id = a.environment_id
      and e.active = 1
      and e.missing = 0
    `

  const envVersions = db.prepare(sql).all()
  logger.mylog('debug', envVersions)

  let css = '.menu .nav-list a:not(.caret)::after { font-size: 10px; }'

  envVersions.forEach(row => {

    let matchesTag
    for (let tag of tags) {
      matchesTag = tag
      for (let file of files) {
        if (row[file.col] !== md5s[`https://raw.githubusercontent.com/PMET-public/magento-cloud/${tag}/${file.path}`]) {
          logger.mylog('debug', `Project: ${row.project_id}, env: ${row.environment_id} does not match version of ${file.path} of tag ${tag}`)
          matchesTag = false 
          break // file md5 does not match; skip to next tag
        }
      }
      if (matchesTag) {
        break // latestAvailble must have matched for all files' md5s in this tag
      }
    }

    let envHref = '/projects/' + row.project_id + '/environments/' +  row.environment_id
    css += '\n.menu .nav-list a[href="' + envHref + '"]:not(.caret)::after { content: "' +  row.ee_composer_version
    if (row.base_url_found === 0 || row.base_url_found === null) {
      css += ' ??"; color: #e12c27; background-color: #5b5856; padding: 2px 4px;'
    } else if (matchesTag) {
      if (/-GA/.test(matchesTag)) {
        css += ' GA ✔"; color: #79a22e;'
      } else if (/-RC/.test(matchesTag)) {
        css += ' RC"; color: #e0c56d;'
      }
    } else {
      css += ' ⇪"; color: #f26322;'
    }
    css += '}'
  })
  css += `\nul#environments::after {
    color: #e0c56d;
    content: 'Env available checked hourly, versions checked every 6 hrs. Last generated: ${new Date().toGMTString()}';
    white-space: pre-wrap;
    font-size: 0.8em;
    font-weight: normal;
    padding: 4em 1em 0 2em;
  }`
  logger.mylog('info', css)
  return css
}
exports.generateCss = generateCss