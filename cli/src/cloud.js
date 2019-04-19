const {db, logger, fetch} = require('./common')
const md5 = require('md5')

const generateCss = async () => {

  const flavors = ['ref', 'demo', 'b2b', 'pwa']
  const files = [ 
    {path: '.magento.app.yaml', col: 'app_yaml_md5'}, 
    {path: 'composer.lock', col: 'composer_lock_md5'},
    {path: 'app/etc/config.php', col: 'config_php_md5'}
  ]
  const md5s = {}
  const promises = []

  flavors.forEach( flavor => {
    files.forEach( file => {
      const url = `https://raw.githubusercontent.com/PMET-public/magento-cloud/cur-${flavor}/${file.path}`
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

  const sql = `SELECT a.project_id, p.title project_title, a.environment_id, a.ee_composer_version, a.app_yaml_md5, a.composer_lock_md5, a.config_php_md5, a.timestamp
    FROM applications a, environments e, projects p
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
  let timestamp = 0

  envVersions.forEach(row => {

    let latestAvailable
    for (let flavor of flavors) {
      latestAvailable = true
      for (let file of files) {
        if (row[file.col] !== md5s[`https://raw.githubusercontent.com/PMET-public/magento-cloud/cur-${flavor}/${file.path}`]) {
          latestAvailable = false 
          break // file md5 does not a match; skip to next flavor
        }
      }
      if (latestAvailable) {
        break // latestAvailble must have matched for all files' md5s in this flavor
      }
    }

    if (row.timestamp > timestamp) {
      timestamp = row.timestamp
    }
    let envHref = '/projects/' + row.project_id + '/environments/' +  row.environment_id
    css += '\n.menu .nav-list a[href="' + envHref + '"]:not(.caret)::after {'
    if (latestAvailable) {
      css += 'content: "' + row.ee_composer_version + ' ✔"; color: #79a22e;'
    } else {
      css += 'content: "' + row.ee_composer_version + ' ⇪"; color: #f26322;'
    }
    css += '}'
  })
  css += `\nul#environments::after {
    color: #e0c56d;
    content: '\\AVersion info last updated:\\A${new Date(timestamp * 1000).toGMTString()}\\A';
    white-space: pre-wrap;
    font-size: 0.8em;
    font-weight: normal;
    padding-left: 20px;
  }`
  logger.mylog('info', css)
  return css
}
exports.generateCss = generateCss