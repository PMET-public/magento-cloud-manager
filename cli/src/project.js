const {exec, execOutputHandler, db, MC_CLI, logger} = require('./common')
const {updateEnvironmentFromApi, setEnvironmentMissing, setEnvironmentBranchLevel} = require('./environment')
const {addCloudProjectKeyToGitlabKeys} = require('./gitlab')
const {addUser, recordUsers} = require('./user')
const {setVar} = require('./variable')
const {getActivitiesFromApi} = require('./activity')
const {defaultCloudUsers, defaultCloudVars} = require('../.secrets.json')

const getProjectsFromApi = async () => {
  const cmd = `${MC_CLI} projects --pipe`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      const apiProjects = stdout.trim().split('\n')
      // before returning ...
      // active projects in the DB but not in the API should be marked inactive
      const sql = 'SELECT id FROM projects WHERE active = 1;'
      const result = db.prepare(sql).all()
      logger.mylog('debug', result)
      const dbProjects = result.map(row => row.id)
      const difference = dbProjects.filter(id => !apiProjects.includes(id))
      difference.forEach(setProjectInactive)
      return apiProjects
    })
    .catch(error => logger.mylog('error', error))
  return result
}
exports.getProjectsFromApi = getProjectsFromApi

const updateProject = async project => {
  try {
    await getProjectInfoFromApi(project)
    await recordUsers(project)
    await discoverEnvs(project)
    logger.mylog('info', `Project: ${project}'s info, users, and envs updated.`)
    return true
  } catch (error) {
    if (error.message && /Specified project not found|title.*Forbidden/.test(error.message)) {
      return setProjectInactive(project)
    }
    logger.mylog('error', error)
  }
}
exports.updateProject = updateProject

const setProjectInactive = project => {
  const sql = 'UPDATE projects SET active = 0, timestamp = cast(strftime("%s",CURRENT_TIMESTAMP) as int) WHERE id = ?'
  const result = db.prepare(sql).run(project)
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
      const allowedEnvs = projectInfo.replace(/[\s\S]*environments: ([^\s]*)[\s\S]*/, '$1')
      const storage = projectInfo.replace(/[\s\S]*storage: ([^\s]*)[\s\S]*/, '$1')
      const userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/, '$1')
      const sql = `INSERT OR REPLACE INTO projects 
        (id, title, region, project_url, git_url, created_at, plan_size, 
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

const getProjEnvsFromDB = project => {
  const sql = 'SELECT * FROM environments WHERE project_id = ?'
  const result = db.prepare(sql).all(project)
  logger.mylog('debug', result)
  return result
}

const discoverEnvs = async project => {
  const cmd = `${MC_CLI} environment:list --no-header --columns=id,status -p ${project}`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(async ({stdout, stderr}) => {
      if (/An API error occurred./.test(stderr)) {
        throw 'An API error occurred.'
      }
      const promises = []
      const projEnvsFromDB = getProjEnvsFromDB(project)
      const projEnvIds = projEnvsFromDB.map(row => row.id)
      stdout
        .replace(/\+--.*\n?/g, '')
        .trim()
        .split('\n')
        .map(row => row.replace(/\s*\|\s?/g,'\t').split('\t'))
        .forEach(([startingTab, environment, status, endingTab]) => {
          status = status.trim()
          const preceedingSpaces = environment.search(/\S/)
          environment = environment.trim()
          const branchLevel = environment === 'master' ? 0 : Math.floor(preceedingSpaces/3) + 1
          const envFromDB = projEnvsFromDB.find(obj => obj.id === environment)
          const active = status === 'Active' || status === '"In progress"' ? 1 : 0
          const index = projEnvIds.indexOf(environment)
          setEnvironmentMissing(project, environment, 0)
          // in API & DB, remove from tracking list
          if (index > -1) { 
            projEnvIds.splice(index, 1);
            // if branch level value does't match, update branch level
            if (typeof envFromDB !== 'undefined' && envFromDB.branchLevel !== branchLevel) {
              setEnvironmentBranchLevel(project, environment, branchLevel)
            }
            // active status doesn't match, update env
            if (active !== envFromDB.active) {
              promises.push(updateEnvironmentFromApi(project, environment))
            }
          } else {
            // found in API but not DB -> run update env to add new env; then update branch level
            promises.push((async () => {
              await updateEnvironmentFromApi(project, environment)
              return setEnvironmentBranchLevel(project, environment, branchLevel)
            })())
          }

          // if master env and inactive, initialize project and 
          if (environment === 'master' && !active) {
            promises.push((async () => {
              // check if previously initialized
              const result = await getActivitiesFromApi(project, 'environment.variable.create')
              if (!result || (Array.isArray(result) && !result.length)) {
                return initProject(project)
              }
              return true
            })())
          }
        })
      if (projEnvIds.length) {
        // in DB but not API -> set to missing
        projEnvIds.forEach(environment => setEnvironmentMissing(project, environment))
      }
      const result = await Promise.all(promises)
      return result
    })
    .catch(error => logger.mylog('error', error))
  return result
}

const initProject = async project => {
  const promises = []
  // attempt sequential iteration b/c cloud appears to misss users if calls are too quick
  const cloudUsers = Object.entries(defaultCloudUsers)
  for (let i = 0; i < cloudUsers.length; i++) {
    let [email, role] = cloudUsers[i]
    await addUser(project, 'master', email, role)
  }
  promises.push(addCloudProjectKeyToGitlabKeys(project))
  // this iteration must be sequential b/c cloud has lock conflicts when vars are set too quickly
  const cloudVars = Object.entries(defaultCloudVars)
  for (let i = 0; i < cloudVars.length; i++) {
    let [name, value] = cloudVars[i]
    await setVar(project, 'master', name, value)
  }
  const result = await Promise.all(promises)
  return result
}