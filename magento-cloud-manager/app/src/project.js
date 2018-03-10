const {exec, execOutputHandler, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')

exports.getProjectsFromApi = () => {
  return exec(`${MC_CLI} projects --pipe`)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => {
      logger.mylog('error', error)
    })
}

exports.updateProject = async project => {
  return exec(`${MC_CLI} project:info -p ${project} --format=tsv`)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const projectInfo = stdout
      const title = projectInfo.replace(/[\s\S]*title\t"?([^"\n]*)"?[\s\S]*/, '$1')
      const gitUrl = projectInfo.replace(/[\s\S]*url: '([^']*)'[\s\S]*/, '$1')
      const region = gitUrl.replace(/.*@git\.([^.]+).*/, '$1')
      const projectUrl = `https://${region}.magento.cloud/#/projects/${project}`
      const createdAt = Date.parse(projectInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      const clientSshKey = projectInfo.replace(/[\s\S]*client_ssh_key: '([^']*)[\s\S]*/, '$1')
      const planSize = projectInfo.replace(/[\s\S]*plan: ([^\s]*)[\s\S]*/, '$1')
      const allowedEnvironments = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/, '$1')
      const storage = projectInfo.replace(/[\s\S]*storage: ([^\n]*)[\s\S]*/, '$1')
      const userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/, '$1')
      const result = db
        .prepare(
          `INSERT OR REPLACE INTO projects (id, title, region, project_url, git_url, created_at, plan_size,
          allowed_environments, storage, user_licenses, active, client_ssh_key) VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          project,
          title,
          region,
          projectUrl,
          gitUrl,
          createdAt,
          planSize,
          allowedEnvironments,
          storage,
          userLicenses,
          1,
          clientSshKey
        )
      logger.mylog('debug', result)
      return result
    })
    .catch(error => {
      logger.mylog('error', error)
    })
}

async function recordUsers(project) {
  return exec(`${MC_CLI} user:list -p ${project} --format=tsv | sed '1d'`)
  .then(execOutputHandler)
  .then(({stdout, stderr}) => {
    const insertValues = []
    const rows = stdout.trim().split('\n')
      .map(row => row.split('\t'))
      .forEach(row => insertValues.push(`("${project}", "${row[0]}", "${row[2]}")`))
    const sql = `DELETE FROM users WHERE project_id = "${project}";
      INSERT INTO users (project_id, email, role) VALUES ${insertValues.join(',')}`
    const result = db.exec(sql)
    logger.mylog('debug', result)
    return result
  })
  .catch(error => {
    logger.mylog('error', error)
  })
}

exports.updateProjects = async () => {
  // mark all projects inactive; active ones will be updated to active
  const result = db.exec('UPDATE projects SET active = 0')
  logger.mylog('debug', result)
  const promises = []
  ;(await exports.getProjectsFromApi()).forEach(project => {
    promises.push(apiLimit(async () => {
      await exports.updateProject(project)
      await recordUsers(project)
    }))
  })
  return await Promise.all(promises)
}
