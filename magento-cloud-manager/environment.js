const {exec, db, apiLimit, sshLimit, MC_CLI, winston} = require('./common');
const { getProjectsFromApi } = require('./project');

function updateEnvironment(project, environment = 'master') {
  return exec(`${MC_CLI} environment:info -p ${project} -e "${environment}" --format=tsv`)
    .then(({ stdout, stderr }) => {
      if (stderr) {
        winston.error(stderr);
        throw stderr;
      }
      const title = stdout.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/,'$1').replace(/"/g,'');
      const active = /\nstatus\s+active/.test(stdout) ? 1 : 0;
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
      db.prepare('INSERT OR REPLACE INTO environments (id, project_id, title, active, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(environment, project, title, active, createdAt);
    });
}

function setEnvironmentInactive(project, environment) {
  db.prepare('UPDATE environments SET active = 0, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment);
}

function setEnvironmentFailed(project, environment) {
  db.prepare('UPDATE environments SET failure = 1, timestamp = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?')
    .run(project, environment);
}


function getEnvironmentsFromAPI(project) {
  return exec(`${MC_CLI} environments -p ${project} --pipe`)
    .then(({ stdout, stderr }) => {
      if (stderr) {
        winston.error(stderr);
        throw stderr;
      }
      return stdout.trim().split('\n');
    });
}


async function updateAllCurrentProjectsEnvironmentsFromAPI() {
  const promises = [];
  (await getProjectsFromApi()).forEach(project => {
    promises.push(apiLimit(async () => {
      const environments = await getEnvironmentsFromAPI(project);
      environments.forEach(environment => {
        updateEnvironment(project, environment);
      });
    }));
  });
  return await Promise.all(promises);
}

// need to delete from child first
// or how to warn if inactive parent & active child?
async function deleteInactiveEnvironments() {
  const promises = [];
  (await getProjectsFromApi()).forEach(project => {
    promises.push(apiLimit(() => {
      exec(`${MC_CLI} environment:delete -p ${project} --inactive --no-wait -y`)
        .catch(error => {
          winston.error(error);
        });
    }));
  });
  return await Promise.all(promises);
}

exports.setEnvironmentInactive = setEnvironmentInactive;
exports.setEnvironmentFailed = setEnvironmentFailed;
exports.getEnvironmentsFromAPI = getEnvironmentsFromAPI;
exports.updateAllCurrentProjectsEnvironmentsFromAPI = updateAllCurrentProjectsEnvironmentsFromAPI;
exports.deleteInactiveEnvironments = deleteInactiveEnvironments;
