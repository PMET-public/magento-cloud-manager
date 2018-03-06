const {exec, db, apiLimit, MC_CLI, logger, fetch} = require('./common')

const {gitlabToken} = require('../.secrets.json')
const {gitlabDomain, gitlabProjectIds} = require('../config.json')
const perPage = 100
const defaultHeaders = {
  'PRIVATE-TOKEN': `${gitlabToken}`,
  'content-type': 'application/json'
}

function resolveApiUrl(apiPath, pageNumber = 1) {
  return `${gitlabDomain}/api/v4/${apiPath}?page=${pageNumber}&per_page=${perPage}`
}

async function getNumberOfResultPages(apiPath) {
  let promise = await fetch(resolveApiUrl(apiPath), {
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
    let response = await fetch(resolveApiUrl(apiPath, i), {
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
  return await fetch(resolveApiUrl(apiPath), {
    headers: defaultHeaders,
    method: 'POST'
  })
    .then(res => res.text())
    .then(body => JSON.parse(body))
}

async function getAllDeployKeys() {
  return await apiGet('deploy_keys')
}

async function getProjectDeployKeys(projectId) {
  return await apiGet(`projects/${projectId}/deploy_keys`)
}

async function enableDeployKey(projectId, keyId) {
  return await apiPost(`projects/${projectId}/deploy_keys/${keyId}/enable`)
}

(async function() {
  const promises = []
  const allCloudKeyIds = (await getAllDeployKeys()).filter(key => /@platform|@magento/.test(key.key)).map(key => key.id)
  for (let projectId of gitlabProjectIds) {
    let projectDeployKeyIds = (await getProjectDeployKeys(projectId)).map(key => key.id)
    for (let keyId of allCloudKeyIds) {
      if (projectDeployKeyIds.indexOf(keyId) === -1) {
        let result = await enableDeployKey(projectId, keyId)
        logger.mylog('info', result)
      }
    }
  }
  return await Promise.all(promises)
})()
