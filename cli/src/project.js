const {exec, execOutputHandler, db, MC_CLI, logger} = require('./common')
const {updateEnvironment, setEnvironmentMissing} = require('./environment')
const {addCloudProjectKeyToGitlabKeys} = require('./gitlab')
const {addUser, recordUsers} = require('./user')
const {setVar} = require('./variable')
const {defaultCloudUsers, defaultCloudVars} = require('../.secrets.json')

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
    if (error.message && /Specified project not found/.test(error.message)) {
      return setProjectInactive(project)
    }
    logger.mylog('error', error)
  }
}
exports.updateProject = updateProject

const setProjectInactive = project => {
  const result = db
    .prepare('UPDATE projects SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE id = ?')
    .run(project)
  logger.mylog('debug', result)
  logger.mylog('info', `Project: ${project} set to inactive.`)
  return result
}
exports.setProjectInactive = setProjectInactive


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

const getEnvsFromDB = project => {
  const sql = 'SELECT id FROM environments WHERE project_id = ?'
  const result = db.prepare(sql).all(project)
  logger.mylog('debug', result)
  return result
}

const discoverEnvs = async project => {
  const cmd = `${MC_CLI} environment:list -p ${project} --format=tsv | sed '1d'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      const promises = []
      const dbEnvironments = getEnvsFromDB(project).map(row => row.id)
      stdout
        .trim()
        .split('\n')
        .map(row => row.split('\t'))
        .forEach(([environment, name, status]) => {

          const index = dbEnvironments.indexOf(environment)
          if (index > -1) { // in API & DB, remove from tracking list
            dbEnvironments.splice(index, 1);
          } else {
            // found in API but not DB -> run update env
            promises.push(updateEnvironment(project, environment))
          }
          // if master env and inactive, initialize project and 
          if (environment === 'master' && /inactive/i.test(status)) {
            promises.push(initProject(project))
            promises.push(addCloudProjectKeyToGitlabKeys(project))
          }
        })
      if (dbEnvironments.length) {
        // in DB but not API -> set to missing
        dbEnvironments.forEach(environment => setEnvironmentMissing(project, environment))
      }
      const result = await Promise.all(promises)
      return result
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.discoverEnvs = discoverEnvs

const initProject = async project => {
  const promises = []
  Object.entries(defaultCloudVars).forEach(([name, value]) => promises.push(setVar(project, 'master', name, value)))
  Object.entries(defaultCloudUsers).forEach(([email, role]) => promises.push(addUser(project, 'master', email, role)))
  const result = await Promise.all(promises)
  return result
}