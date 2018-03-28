const {exec, db, apiLimit, MC_CLI, logger, fetch} = require('./common')

const {gitlabToken} = require('../.secrets.json')
const {gitlabDomain, gitlabProjectIds} = require('../config.json')
const perPage = 100
const defaultHeaders = {
  'PRIVATE-TOKEN': `${gitlabToken}`,
  'content-type': 'application/json'
}

const buildApiUrl = (apiPath, pageNumber = 1) => {
  return `${gitlabDomain}/api/v4/${apiPath}?page=${pageNumber}&per_page=${perPage}`
}

const getNumberOfResultPages = async apiPath => {
  let promise = await fetch(buildApiUrl(apiPath), {
    headers: defaultHeaders,
    method: 'GET'
  })
    .then(response => response.headers.get('X-Total-Pages'))
    .catch(error => logger.mylog('error', error))
  return promise
}

const apiGet = async apiPath => {
  const totalPages = await getNumberOfResultPages(apiPath)
  let results = []
  for (let i = 1; i <= totalPages; i++) {
    let response = await fetch(buildApiUrl(apiPath, i), {
      headers: defaultHeaders,
      method: 'GET'
    })
      .then(res => res.text())
      .then(body => JSON.parse(body))
    results = results.concat(response)
  }
  return results
}

const apiPost = async (apiPath, data = {}) => {
  return await fetch(buildApiUrl(apiPath), {
    headers: defaultHeaders,
    method: 'POST',
    body: JSON.stringify(data)
  })
    .then(res => res.text())
    .then(body => JSON.parse(body))
}

const getAllDeployKeysFromGitlab = () => {
  return apiGet('deploy_keys')
}

const getGitlabProjectDeployKeys = gitlabProjectId => {
  return apiGet(`projects/${gitlabProjectId}/deploy_keys`)
}

const enableDeployKey = (gitlabProjectId, keyId) => {
  return apiPost(`projects/${gitlabProjectId}/deploy_keys/${keyId}/enable`)
}

exports.enableAllGitlabKeysForAllConfiguredProjects = async () => {
  // use awaits to run requests sequentially and reduce load on gitlab
  // this function should complete in < 1 min regardless and is only run infrequently
  const allCloudKeyIdsInGitlab = (await getAllDeployKeysFromGitlab())
    .filter(key => /@platform|@magento/.test(key.key))
    .map(key => key.id)
  for (let gitlabProjectId of gitlabProjectIds) {
    let gitlabProjectDeployKeyIds = (await getGitlabProjectDeployKeys(gitlabProjectId)).map(key => key.id)
    for (let keyId of allCloudKeyIdsInGitlab) {
      if (gitlabProjectDeployKeyIds.indexOf(keyId) === -1) {
        let result = await enableDeployKey(gitlabProjectId, keyId)
        logger.mylog('debug', result)
      }
    }
  }
  logger.mylog(
    'info', `All ${allCloudKeyIdsInGitlab.length} public cloud keys added to` + 
    `Gitlab enabled to access all ${gitlabProjectIds.length} configured Gitlab projects.`
  )
}

exports.addCloudProjectKeyToGitlabKeys = async cloudProject => {
  try {
    const sql = 'SELECT client_ssh_key FROM projects WHERE id = ?'
    let result = db.prepare(sql).get(cloudProject)
    if (typeof result == 'undefined') {
      throw 'Row not found.'
    }
    const clientSshKey = result.client_ssh_key
    logger.mylog('debug', result)
    for (let gitlabProjectId of gitlabProjectIds) {
      result = await apiPost(`projects/${gitlabProjectId}/deploy_keys`, {
        title: 'MECE',
        key: clientSshKey
      })
      logger.mylog('debug', result)
    }
    logger.mylog('info', `Public key of project: ${cloudProject} added to Gitlab projects.`)
  } catch (error) {
    logger.mylog('error', error)
  }
}
