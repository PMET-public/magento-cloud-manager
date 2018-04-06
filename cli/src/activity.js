const {exec, execOutputHandler, MC_CLI, logger} = require('./common')
const {setEnvironmentFailure} = require('./environment')

const parseActivityList = activities => {
  const successes = {}
  const failures = {}
  activities.forEach(activity => {
    // eslint-disable-next-line
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

const getActivitiesFromApi = async (project, type) => {
  const cmd = `${MC_CLI} activity:list -p ${project} -e master -a --type=environment.${type} --limit=9999 --format=tsv`
  const result = exec(cmd)
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
      throw error
    })
  return result
}

const mergeMostRecentActivityResultByEnv = (resultLists) => {
  let combinedKeys = []
  resultLists.forEach(list => combinedKeys = combinedKeys.concat(Object.keys(list)))
  combinedKeys = new Set(combinedKeys)
  const combinedResults = {}
  //const combinedKeys = new Set(Object.keys(arr1).concat(Object.keys(arr2)))
  // find the most recent result
  combinedKeys.forEach(env => {
    resultLists.forEach(list => {
      if (!combinedResults[env] || (list[env] && list[env] > combinedResults[env])) {
        combinedResults[env] = list[env]
      }
    })
    // let time1 = arr1[env],
    //   time2 = arr2[env]
    // combinedResults[env] =
    //   typeof time2 === 'undefined' || (typeof time1 !== 'undefined' && time2 < time1) ? time1 : time2
  })
  return combinedResults
}

exports.searchActivitiesForFailures = async (project) => {
  try {
    let fails = 0
    let successes = 0
    const branchActivities = await getActivitiesFromApi(project, 'branch')
    const pushActivities = await getActivitiesFromApi(project, 'push')
    const redeployActivities = await getActivitiesFromApi(project, 'redeploy')
    const branchResults = parseActivityList(branchActivities)
    const pushResults = parseActivityList(pushActivities)
    const redeployResults = parseActivityList(redeployActivities)
    const combinedSuccesses = mergeMostRecentActivityResultByEnv([branchResults.successes, pushResults.successes, redeployResults.successes])
    const combinedFailures = mergeMostRecentActivityResultByEnv([branchResults.failures, pushResults.failures, redeployResults.failures])
    for (let environment in combinedFailures) {
      const value =
        typeof combinedSuccesses[environment] === 'undefined' ||
        combinedSuccesses[environment] < combinedFailures[environment]
          ? 1
          : 0
      value ? fails++ : successes++
      setEnvironmentFailure(project, environment, value)
    }
    logger.mylog('info', `Found ${fails} failing and ${successes} now successful envs in project ${project}.`)
    return true
  } catch (error) {
    logger.mylog('error', error)
  }
}
