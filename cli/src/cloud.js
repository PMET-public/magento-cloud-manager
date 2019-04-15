const {exec, execOutputHandler, db, logger, parseFormattedCmdOutputIntoDB} = require('./common')

const generateCss = () => {
  // identify cotenants: currently active envs on the same host when they were last checked since
  // their boot time, # cpus, & ip address were the same at that time.
  // (ordered by region to keep hosts in the same region together when enumerated)
  const sql = `select st.project_id, st.environment_id, st.ee_composer_version, st.app_yaml_md5, st.composer_lock_md5, max(st.timestamp)
      from smoke_tests st, environments e, projects p
    where p.active = 1
      and p.region = 'demo'
      and p.id = e.project_id
      and p.id = st.project_id 
      and e.id = st.environment_id
      and e.active = 1
      and e.missing = 0
    group by p.id, e.id`

  const envVersions = db.prepare(sql).all()
  logger.mylog('debug', envVersions)
  let css = '.menu .nav-list a:not(.caret)::after { font-size: 10px; }'
  envVersions.forEach(row => {
    let envHref = '/projects/' + row.project_id + '/environments/' +  row.environment_id
    css += '\n.menu .nav-list a[href="' + envHref + '"]:not(.caret)::after {'
    if (row.ee_composer_version === '2.3.1') {
      css += 'content: "' + row.ee_composer_version + ' ✔"; color: #79a22e;'
    } else {
      css += 'content: "' + row.ee_composer_version + '"; color: #f26322;'
    }
    css += '}'
  })
  logger.mylog('info', css)
  return css
}
exports.generateCss = generateCss