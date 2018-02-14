const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');
const db = new Database('sql/cloud.db');
const pLimit = require('p-limit');
const apiLimit = pLimit(10);
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';
const { setEnvironmentFailed } = require('./environment');
const { getProjectsFromApi } = require('./project');

function parseActivityList(activities) {
  const successes = {};
  const failures = {};
  activities.forEach(activity => {
    let [id, created, description, progress, state, result, environment] = activity.split('\t');
    environment = environment.replace(/"/g,'').replace(/.*, /,''); // for branch activity, remove parent name & only keep new branch name
    if (result === 'failure') {
      if (!failures[environment]) {
        failures[environment] = created;
      }
    } else if (result === 'success') {
      if (!successes[environment]) {
        successes[environment] = created;
      }
    }
  });
  return { successes: successes, failures: failures};
}

function fetchActivities(project, type) {
  return exec(`${MC_CLI} activity:list -p ${project} -e master -a --type=environment.${type} --limit=9999 --format=tsv`)
    .then( ({stdout, stderr}) => {
      return stdout.trim().split('\n').slice(1);
    })
    .catch( error => {
      if (!/No activities found/.test(error.stderr)) {
        throw error;
      }
      return [];
    });
}

function mergeMostRecentActivityResultByEnv(arr1, arr2) {
  const combinedResults = {};
  const combinedKeys = new Set(Object.keys(arr1).concat(Object.keys(arr2)));
  combinedKeys.forEach( env => {
    let time1 = arr1[env], time2 = arr2[env];
    combinedResults[env] = typeof time2 === 'undefined' || (typeof time1 !== 'undefined' && time2 < time1 ) ? time1 : time2;
  });
  return combinedResults;
}

async function searchProjectsActivitiesForFailedEnviornments() {
  const promises = [];
  getProjectsFromApi()
    .then( projects => {
      projects.forEach( project => {
        promises.push( apiLimit(() => {
          Promise.all([fetchActivities(project, 'branch'), fetchActivities(project, 'push')])
            .then( ([branchActivities, pushActivities]) => {
              const branchResults = parseActivityList(branchActivities);
              const pushResults = parseActivityList(pushActivities);
              const combinedSuccesses = mergeMostRecentActivityResultByEnv(branchResults.successes, pushResults.successes);
              const combinedFailures = mergeMostRecentActivityResultByEnv(branchResults.failures, pushResults.failures);
              for (let environment in combinedFailures) {
                if (typeof combinedSuccesses[environment] === 'undefined' || combinedSuccesses[environment] < combinedFailures[environment]) {
                  setEnvironmentFailed(project, environment);
                }
              }
            });
        }));
      });
    })
    .catch( error => {
      console.error(error);
    });
  //const result = await Promise.all(promises);
  //console.log(result);
}

searchProjectsActivitiesForFailedEnviornments();
