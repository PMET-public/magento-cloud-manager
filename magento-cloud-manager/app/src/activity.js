const {exec, execOutputHandler, db, apiLimit, MC_CLI, logger} = require('./common')
const {setEnvironmentFailed} = require('./environment')
const {getProjectsFromApi} = require('./project')

function parseActivityList(activities) {
  const successes = {}
  const failures = {}
  activities.forEach(activity => {
    let [id, created, description, progress, state, result, environment] = activity.split('\t')
    environment = environment.replace(/"/g, '').replace(/.*, /, '') // for branch activity, remove parent name & only keep new branch name
    if (result === 'failure') {
      if (!failures[environment]) {
        failures[environment] = created
      }
    } else if (result === 'success') {
      if (!successes[environment]) {
        successes[environment] = created
      }
    }
  })
  return {successes: successes, failures: failures}
}

function getActivitiesFromApi(project, type) {
  return exec(`${MC_CLI} activity:list -p ${project} -e master -a --type=environment.${type} --limit=9999 --format=tsv`)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout
        .trim()
        .split('\n')
        .slice(1)
    })
    .catch(error => {
      logger.mylog('error', error)
      if (/No activities found/.test(error.stderr)) {
        return []
      }
      return []
    })
}

function mergeMostRecentActivityResultByEnv(arr1, arr2) {
  const combinedResults = {}
  const combinedKeys = new Set(Object.keys(arr1).concat(Object.keys(arr2)))
  combinedKeys.forEach(env => {
    let time1 = arr1[env],
      time2 = arr2[env]
    combinedResults[env] =
      typeof time2 === 'undefined' || (typeof time1 !== 'undefined' && time2 < time1) ? time1 : time2
  })
  return combinedResults
}

exports.searchActivitiesForFailures = async () => {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(
      apiLimit(async () => {
        const branchActivities = await getActivitiesFromApi(project, 'branch')
        const pushActivities = await getActivitiesFromApi(project, 'push')
        const branchResults = parseActivityList(branchActivities)
        const pushResults = parseActivityList(pushActivities)
        const combinedSuccesses = mergeMostRecentActivityResultByEnv(branchResults.successes, pushResults.successes)
        const combinedFailures = mergeMostRecentActivityResultByEnv(branchResults.failures, pushResults.failures)
        for (let environment in combinedFailures) {
          if (
            typeof combinedSuccesses[environment] === 'undefined' ||
            combinedSuccesses[environment] < combinedFailures[environment]
          ) {
            setEnvironmentFailed(project, environment)
          }
        }
      })
    )
  })
  return await Promise.all(promises)
}
