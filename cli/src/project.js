const {exec, execOutputHandler, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')

exports.getProjectsFromApi = getProjectsFromApi = async () => {
  const cmd = `${MC_CLI} projects --pipe`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => logger.mylog('error', error))
  return result
}

exports.updateProject = updateProject = async project => {
  const cmd = `${MC_CLI} project:info -p ${project} --format=tsv`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const projectInfo = stdout
      const title = projectInfo.replace(/[\s\S]*title\t"?([^"\n]*)"?[\s\S]*/, '$1')
      const gitUrl = projectInfo.replace(/[\s\S]*url: '([^']*)'[\s\S]*/, '$1')
      const region = gitUrl.replace(/.*@git\.([^.]+).*/, '$1')
      const projectUrl = `https://${region}.magento.cloud/projects/${project}`
      const createdAt = Date.parse(projectInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000
      const clientSshKey = projectInfo.replace(/[\s\S]*client_ssh_key: '([^']*)[\s\S]*/, '$1')
      const planSize = projectInfo.replace(/[\s\S]*plan: ([^\s]*)[\s\S]*/, '$1')
      const allowedEnvironments = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/, '$1')
      const storage = projectInfo.replace(/[\s\S]*storage: ([^\n]*)[\s\S]*/, '$1')
      const userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/, '$1')
      const sql = `INSERT OR REPLACE INTO projects (id, title, region, project_url, git_url, created_at, plan_size,
        allowed_environments, storage, user_licenses, active, client_ssh_key) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      const result = db
        .prepare(sql)
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
      logger.mylog('info', `Project: ${project} updated.`)
      return result
    })
    .catch(error => logger.mylog('error', error))
  return result
}

const recordUsers = async project => {
  const cmd = `${MC_CLI} user:list -p ${project} --format=tsv | sed '1d'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const insertValues = []
      const rows = stdout
        .trim()
        .split('\n')
        .map(row => row.split('\t'))
        .forEach(row => insertValues.push(`("${project}", "${row[0]}", "${row[2]}")`))
      const sql = `DELETE FROM users WHERE project_id = "${project}";
        INSERT INTO users (project_id, email, role) VALUES ${insertValues.join(',')}`
      const result = db.exec(sql)
      logger.mylog('debug', result)
      return result
    })
    .catch(error => logger.mylog('error', error))
  return result
}

exports.updateProjects = async () => {
  // mark all projects inactive; active ones will be updated to active
  const sql = 'UPDATE projects SET active = 0'
  let result = db.exec(sql)
  logger.mylog('debug', result)
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(async () => {
        await updateProject(project)
        await recordUsers(project)
      })
    )
  })
  result = await Promise.all(promises)
  logger.mylog('info', `All ${promises.length} projects updated.`)
  return result
}
