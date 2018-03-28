const {exec, execOutputHandler, db, apiLimit, MC_CLI, logger} = require('./common')
const {setEnvironmentFailure} = require('./environment')
const {getProjectsFromApi} = require('./project')

const parseActivityList = activities => {
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

const getActivitiesFromApi = (project, type) => {
  const cmd = `${MC_CLI} activity:list -p ${project} -e master -a --type=environment.${type} --limit=9999 --format=tsv`
  return exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      return stdout
        .trim()
        .split('\n')
        .slice(1)
    })
    .catch(error => {
      if (/No activities found/.test(error.stderr)) { 
        // this should not be considered an error, but the CLI has a non-zero exit status
        // log the "error" for verbose mode and return an empty array
        logger.mylog('debug', error.stderr)
        return []
      }
      logger.mylog('error', error)
      return []
    })
}

const mergeMostRecentActivityResultByEnv = (arr1, arr2) => {
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
          const value = typeof combinedSuccesses[environment] === 'undefined' ||
            combinedSuccesses[environment] < combinedFailures[environment] ? 1 : 0
          setEnvironmentFailure(project, environment, value)
        }
      })
    )
  })
  const result = await Promise.all(promises)
  logger.mylog('info', `Activities in ${promises.length} projects searched for failures.`)
  return result
}
