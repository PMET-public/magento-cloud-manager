const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const sqlite3 = require('sqlite3');
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';
const db = new sqlite3.Database('sql/cloud.db');
const pLimit = require('p-limit');
const limit = pLimit(10);
const apiLimit = pLimit(20);
const sshLimit = pLimit(10);

function mergeMostRecentActivityResultByEnv(arr1, arr2) {
  const combinedResults = {};
  const combinedKeys = new Set(Object.keys(arr1).concat(Object.keys(arr2)));
  combinedKeys.forEach((env) => {
    let time1 = arr1[env], time2 = arr2[env];
    combinedResults[env] = typeof time2 === 'undefined' || (typeof time1 !== 'undefined' && time2 < time1 ) ? time1 : time2;
  });
  return combinedResults;
}

function fetchActivities(project, type) {
  const cmd = `${MC_CLI} activity:list -p ${project} -e master -a --type=environment.${type} --limit=9999 --format=tsv`;
  return exec(cmd);
}

async function updateFailedEnvironmentsByProject(project) {
  await Promise.all(
    [fetchActivities(project, 'branch'), fetchActivities(project, 'push')]
  ).then(([branch, push]) => {
    const branchResults = parseActivityList(branch.stdout);
    const pushResults = parseActivityList(push.stdout);
    const successes = mergeMostRecentActivityResultByEnv(branchResults.successes, pushResults.successes);
    const failures = mergeMostRecentActivityResultByEnv(branchResults.failures, pushResults.failures);
    for (let env in failures) {
      let failureState = typeof successes[env] === 'undefined' || successes[env] < failures[env] ? 1 : 0;
      let sql = `UPDATE environments SET failure = ${failureState} where id = "${env}" and project_id = "${project}";`;
      db.exec(sql, (err) => {
        if (err) {
          console.error('Error executing: ', sql);
          throw err;
        }
      });
    }
  }).catch( error => { throw error; });
}

function parseActivityList(stdout) {
  const successes = {};
  const failures = {};
  const activities = stdout.trim().split('\n');
  activities.shift();
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


// updateFailedEnvironmentsByProject('ovrhy7snrch6u');


const input = [
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u')),
  limit(() => updateFailedEnvironmentsByProject('ovrhy7snrch6u'))
];

(async () => {
  // Only one promise is run at once
  const result = await Promise.all(input);
  console.error(result);
})();

//updateApplicationState("dx7mnl3a22cou", "Shopial");
//updateApplicationState("6h4sexqr4xp3i", "master");
//updateApplicationState('ovrhy7snrch6u', "Multisite-Test");


