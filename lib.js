const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const sqlite3 = require('sqlite3');
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';
const db = new sqlite3.Database('sql/cloud.db');
const pLimit = require('p-limit');
const limit = pLimit(10);


async function updateProjects() {

  //mark all projects inactive; the api call will then update only active ones
  const sql = 'UPDATE projects SET active = 0;';
  db.exec(sql);
  const cmd = `${MC_CLI} projects --format=tsv`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Error executing: ', cmd);
      throw err;
    }
    const projectRows = stdout.trim().split('\n');
    projectRows.shift();
    projectRows.forEach((projectRow) => {
      const [ id, title, projectUrl ] = projectRow.trim().split('\t');
      const region = projectUrl.replace(/.*\/\//,'').replace(/\..*/,'');
      const cmd = `${MC_CLI} project:info -p ${id} --format=tsv`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error('Error executing: ', cmd);
          throw err;
        }
        const projectInfo = stdout;
        const gitUrl = projectInfo.replace(/[\s\S]*url: '([^']*)'[\s\S]*/,'$1');
        const createdAt = Date.parse(projectInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
        const clientSshKey = projectInfo.replace(/[\s\S]*client_ssh_key: '([^']*)[\s\S]*/,'$1');
        const planSize = projectInfo.replace(/[\s\S]*plan: ([^\s]*)[\s\S]*/,'$1');
        const allowedEnvironments = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/,'$1');
        const storage = projectInfo.replace(/[\s\S]*storage: ([^\n]*)[\s\S]*/,'$1');
        const userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/,'$1');
        const sql = `INSERT OR REPLACE INTO projects (id, title, region, project_url, git_url, created_at, plan_size, 
          allowed_environments, storage, user_licenses, active, client_ssh_key) VALUES
          ("${id}", "${title}", "${region}", "${projectUrl}", "${gitUrl}", ${createdAt}, 
          "${planSize}", ${allowedEnvironments}, ${storage}, ${userLicenses}, 1, "${clientSshKey}");`;
        db.exec(sql, (err) => {
          if (err) {
            console.error('Error executing: ', sql);
            throw err;
          }
        });
      });
    });
  });

}

async function updateHost(project, environment = 'master') {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    cat /proc/stat | awk '/btime/ {print \\$2}'
    cat /proc/net/route | awk '/eth0	00000000	/ {print \\$3}'
    cat /proc/meminfo | awk '/MemTotal/ {print \\$2 }'
    nproc
    cat /proc/loadavg
  "`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Error executing: ', cmd);
      throw err;
    }
    const [ bootTime, hexIpAddr, totalMemory, cpus, loadAvg ] = stdout.trim().split('\n');
    const ipAddr = hexIpAddr.match(/../g).reverse().map((hex) => {return parseInt(hex,16);}).join('.');
    const [ loadAvg1, loadAvg5, loadAvg15, runningProcesses, totalProcesses, lastPID ] = loadAvg.replace('/',' ').trim().split(' ');
    const sql = `INSERT INTO hosts_states (project_id, environment_id, boot_time, ip, total_memory, cpus, load_avg_1, 
      load_avg_5, load_avg_15, running_processes, total_processes, last_process_id) VALUES
      ("${project}", "${environment}", ${bootTime}, "${ipAddr}", ${totalMemory}, ${cpus}, ${loadAvg1}, ${loadAvg5}, 
      ${loadAvg15}, ${runningProcesses}, ${totalProcesses}, ${lastPID});`;
    db.exec(sql, (err) => {
      if (err) {
        console.error('Error executing: ', sql);
        throw err;
      }
    });
  });
}

async function updateEnvironments() {
  const cmd = `${MC_CLI} projects --pipe | head -5`;
  const {stdout} = await exec(cmd);
  const projects = stdout.trim().split('\n');
  projects.forEach((project) => {
    const cmd = `${MC_CLI} environments -p ${project} --pipe`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing: ', cmd);
        throw err;
      }
      const environments = stdout.trim().split('\n');
      environments.forEach((environment) => {
        const cmd = `${MC_CLI} environment:info -p ${project} -e "${environment}" --format=tsv`;
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            console.error('Error executing: ', cmd);
            throw err;
          }
          let environmentInfo = stdout;
          const title = environmentInfo.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/,'$1').replace(/"/g,'');
          const active = /\nstatus\s+active/.test(environmentInfo) ? 1 : 0;
          const createdAt = Date.parse(environmentInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
          const sql = `INSERT OR REPLACE INTO environments (id, project_id, title, active, created_at) VALUES
              ("${environment}", "${project}", "${title}", ${active}, ${createdAt});`;
          db.exec(sql, (err) => {
            if (err) {
              console.error('Error executing: ', sql);
              throw err;
            }
          });
        });
      });
    });
  });
}

async function deleteInactiveEnvironments() {

  const cmd = `${MC_CLI} projects --pipe | head -5`;
  const {stdout } = await exec(cmd);
  const projects = stdout.trim().split('\n');
  projects.forEach((project) => {
    const cmd = `${MC_CLI} environment:delete -p ${project} --inactive --no-wait -y`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing: ', cmd);
        throw err;
      }
    });
  });

}

async function updateApplicationState(project, environment = 'master') {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    egrep -m 1 'magento/product-enterprise-edition\\":|\\"2\\.[0-9]\\.[0-9]\\.x-dev' composer.lock
    md5sum composer.lock
    stat -t composer.lock | awk '{print \\$12}'
  "`;
  //child_process.execSync(cmd, (err, stdout, stderr) => {
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      if (/successfully connected, but/.test(stderr)) {
        return;
      } else {
        console.error('Error executing: ', cmd);
        throw err;
      }
    }
    let [ EEComposerVersion, composerLockMd5, composerLockMtime ] = stdout.trim().split('\n');
    EEComposerVersion = EEComposerVersion.replace(/.*: "/,'').replace(/".*/,'');
    composerLockMd5 = composerLockMd5.replace(/ .*/,'');
    const sql = `INSERT INTO applications_states (project_id, environment_id, ee_composer_version, composer_lock_md5, composer_lock_mtime) VALUES
      ("${project}", "${environment}", "${EEComposerVersion}", "${composerLockMd5}","${composerLockMtime}");`;
    db.exec(sql, (err) => {
      if (err) {
        console.error('Error executing: ', sql);
        throw err;
      }
    });
  });
}


async function updateAllApplicationStates() {
  const sql = 'select id, project_id from environments where active = 1 limit 50';
  db.each(sql, (err, row) => {
    if (err) {
      console.error('Error executing: ', sql);
      throw err;
    }
    updateApplicationState(row.project_id, row.id);
    //updateApplicationState(row.project_id, row.id)
  });
}

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

//updateAllApplicationStates();
//updateApplicationState("dx7mnl3a22cou", "Shopial");
//updateApplicationState("6h4sexqr4xp3i", "master");
//updateApplicationState('ovrhy7snrch6u', "Multisite-Test");
//updateHost('j7mn26kjab6my');
//updateProjects();
//updateEnvironments();
