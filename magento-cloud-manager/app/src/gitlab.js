const {exec, db, apiLimit, MC_CLI, logger, fetch} = require('./common')

const {gitlabToken} = require('../.secrets.json')
const {gitlabDomain, gitlabProjectIds} = require('../config.json')
const perPage = 100
const defaultHeaders = {
  'PRIVATE-TOKEN': `${gitlabToken}`,
  'content-type': 'application/json'
}

function buildApiUrl(apiPath, pageNumber = 1) {
  return `${gitlabDomain}/api/v4/${apiPath}?page=${pageNumber}&per_page=${perPage}`
}

async function getNumberOfResultPages(apiPath) {
  let promise = await fetch(buildApiUrl(apiPath), {
    headers: defaultHeaders,
    method: 'GET'
  })
    .then(response => response.headers.get('X-Total-Pages'))
    .catch(error => logger.mylog('error', error))
  return promise
}

async function apiGet(apiPath) {
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

async function apiPost(apiPath, data = {}) {
  return await fetch(buildApiUrl(apiPath), {
    headers: defaultHeaders,
    method: 'POST',
    body: JSON.stringify(data)
  })
    .then(res => res.text())
    .then(body => JSON.parse(body))
}

async function getAllDeployKeysFromGitlab() {
  return await apiGet('deploy_keys')
}

async function getGitlabProjectDeployKeys(gitlabProjectId) {
  return await apiGet(`projects/${gitlabProjectId}/deploy_keys`)
}

async function enableDeployKey(gitlabProjectId, keyId) {
  return await apiPost(`projects/${gitlabProjectId}/deploy_keys/${keyId}/enable`)
}

exports.enableAllGitlabKeysForAllConfiguredProjects = async function() {
  const promises = []
  const allCloudKeyIdsInGitlab = (await getAllDeployKeysFromGitlab())
    .filter(key => /@platform|@magento/.test(key.key))
    .map(key => key.id)
  for (let gitlabProjectId of gitlabProjectIds) {
    let gitlabProjectDeployKeyIds = (await getGitlabProjectDeployKeys(gitlabProjectId)).map(key => key.id)
    for (let keyId of allCloudKeyIdsInGitlab) {
      if (gitlabProjectDeployKeyIds.indexOf(keyId) === -1) {
        let result = await enableDeployKey(gitlabProjectId, keyId)
        logger.mylog('info', result)
      }
    }
  }
  return await Promise.all(promises)
}

exports.addCloudProjectKeyToGitlabKeys = async function(cloudProject) {
  try {
    const result = db.prepare('SELECT client_ssh_key FROM projects WHERE id = ?').get(cloudProject)
    logger.mylog('debug', result)
    for (let gitlabProjectId of gitlabProjectIds) {
      await apiPost(`projects/${gitlabProjectId}/deploy_keys`, {
        title: 'MECE',
        key: result.client_ssy_key
      })
    }
  } catch (error) {
    logger.mylog('error', error)
  }
}
