const {db, logger} = require('./common')

const generateCss = () => {
  // identify cotenants: currently active envs on the same host when they were last checked since
  // their boot time, # cpus, & ip address were the same at that time.
  // (ordered by region to keep hosts in the same region together when enumerated)
  const sql = `select a.project_id, a.environment_id, a.ee_composer_version, a.app_yaml_md5, a.composer_lock_md5, max(a.timestamp) timestamp
      from applications a, environments e, projects p
    where p.active = 1
      and p.region = 'demo'
      and p.id = e.project_id
      and p.id = a.project_id 
      and e.id = a.environment_id
      and e.active = 1
      and e.missing = 0
    group by p.id, e.id`

  const envVersions = db.prepare(sql).all()
  logger.mylog('debug', envVersions)
  let css = '.menu .nav-list a:not(.caret)::after { font-size: 10px; }'
  let timestamp = 0
  envVersions.forEach(row => {
    if (row.timestamp > timestamp) {
      timestamp = row.timestamp
    }
    let envHref = '/projects/' + row.project_id + '/environments/' +  row.environment_id
    css += '\n.menu .nav-list a[href="' + envHref + '"]:not(.caret)::after {'
    if (row.ee_composer_version === '2.3.1') {
      css += 'content: "' + row.ee_composer_version + ' ✔"; color: #79a22e;'
    } else {
      css += 'content: "' + row.ee_composer_version + '"; color: #f26322;'
    }
    css += '}'
  })
  css += `\nul#environments::after {
    color: red;
    content: 'Version info last updated:\\A${new Date(timestamp * 1000).toGMTString()}\\A';
    white-space: pre-wrap;
    font-size: 0.8em;
    font-weight: normal;
  }`
  logger.mylog('info', css)
  return css
}
exports.generateCss = generateCss