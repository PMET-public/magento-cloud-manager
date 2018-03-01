const {exec, db, apiLimit, sshLimit, MC_CLI, logger} = require('./common')

exports.getProjectsFromApi = function getProjectsFromApi() {
  return exec(`${MC_CLI} projects --pipe`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      logger.debug(stdout)
      return stdout.trim().split('\n')
    })
    .catch(error => {
      logger.error(error)
    })
}

exports.updateProject = function updateProject(project) {
  return exec(`${MC_CLI} project:info -p ${project} --format=tsv`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      logger.info(stdout)
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
      return db
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
    })
    .catch(error => {
      logger.error(error)
    })
}

exports.updateProjects = async function updateProjects() {
  //mark all projects inactive; the api call will then update only active ones
  db.prepare('UPDATE projects SET active = 0;').run()
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(apiLimit(() => updateProject(project)))
  })
  return await Promise.all(promises)
}
