const {exec, execOutputHandler, db, MC_CLI, logger} = require('./common')
const {updateEnvironment, setEnvironmentMissing} = require('./environment')
const {addCloudProjectKeyToGitlabKeys} = require('./gitlab')

const getProjectsFromApi = async () => {
  const cmd = `${MC_CLI} projects --pipe`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout.trim().split('\n')
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.getProjectsFromApi = getProjectsFromApi

const updateProject = async project => {
  try {
    await getProjectInfoFromApi(project)
    await recordUsers(project)
    logger.mylog('info', `Project: ${project} updated and users recorded.`)
    return true
  } catch (error) {
    logger.mylog('error', error)
  }
}
exports.updateProject = updateProject

const getProjectInfoFromApi = async project => {
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
      const allowedEnvs = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/, '$1')
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
          allowedEnvs,
          storage,
          userLicenses,
          1,
          clientSshKey
        )
      logger.mylog('debug', result)
      return true
    })
  return result
}

const recordUsers = async project => {
  const cmd = `${MC_CLI} user:list -p ${project} --format=tsv | sed '1d'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const insertValues = []
      stdout
        .trim()
        .split('\n')
        .map(row => row.split('\t'))
        .forEach(row => insertValues.push(`("${project}", "${row[0]}", "${row[2]}")`))
      const sql = `DELETE FROM users WHERE project_id = "${project}";
        INSERT INTO users (project_id, email, role) VALUES ${insertValues.join(',')}`
      const result = db.exec(sql)
      logger.mylog('debug', result)
      return true
    })
  return result
}

const discoverEnvs = async project => {
  const cmd = `${MC_CLI} environment:list -p ${project} --format=tsv | sed '1d'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const sql = 'SELECT id FROM environments WHERE project_id = ?'
      const result = db.prepare(sql).all(project)
      logger.mylog('debug', result)
      const dbEnvironments = result.map(row => row.id)
      stdout
        .trim()
        .split('\n')
        .map(row => row.split('\t'))
        .forEach(([environment, name, status]) => {

          const index = dbEnvironments.indexOf(environment)
          if (index > -1) { // in API & DB, remove from list
            dbEnvironments.splice(index, 1);
          } else {
            // found in API but not DB -> run update env
            updateEnvironment(project, environment)
          }
          // if master env and inactive, initialize project and 
          if (environment === 'master' && /inactive/i.test(status)) {
            initProject(project)
            addCloudProjectKeyToGitlabKeys(project)
          }
        })
      if (dbEnvironments.length) {
        // in DB but not API -> set to missing
        dbEnvironments.forEach(environment => setEnvironmentMissing(project, environment))
      }
      return true
    })
  return result
}
exports.discoverEnvs = discoverEnvs

const initProject = async project => {
  console.log('khb inactive')
}

const addUser = async (project, email, role) => {

}

const delUser = async (project, email) => {

}