const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');
const db = new Database('sql/cloud.db');
const pLimit = require('p-limit');
const limit = pLimit(20);
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';

function updateEnvironment(project, environment = 'master') {
  return exec(`${MC_CLI} environment:info -p ${project} -e "${environment}" --format=tsv`)
    .then( ({ stdout, stderr }) => {
      if (stderr) {
        throw stderr;
      }
      const title = stdout.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/,'$1').replace(/"/g,'');
      const active = /\nstatus\s+active/.test(stdout) ? 1 : 0;
      const createdAt = Date.parse(stdout.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
      db.prepare(
        'INSERT OR REPLACE INTO environments (id, project_id, title, active, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(environment, project, title, active, createdAt);
    })
    .catch( error => {
      console.error(error);
    });
}

function getProjectEnvironmentsFromAPI(project) {
  return exec(`${MC_CLI} environments -p ${project} --pipe`)
    .then( async ({ stdout, stderr }) => {
      if (stderr) {
        throw stderr;
      }
      return stdout.trim().split('\n');
    })
    .catch( error => {
      console.error(error);
    });
}


async function updateAllCurrentProjectsEnvironmentsFromAPI() {
  const {stdout, stderr} = await exec(`${MC_CLI} projects --pipe`);
  if (stderr) {
    throw stderr;
  }
  const promises = [];
  const projects = stdout.trim().split('\n');
  // rate limit the calls to get a project's environments
  // also rate limit the calls to get an environment's detailed info
  projects.forEach((project) => {
    promises.push(limit(() => {
      getProjectEnvironmentsFromAPI(project)
        .then( (environments) => {
          environments.forEach((environment) => {
            promises.push(limit(() => updateEnvironment(project, environment)));
          });
        });
    }));
  });
  //const result = await Promise.all(promises);
  //console.log(result);
}


// need to delete from child first
// or how to warn if inactive parent & active child?
async function deleteInactiveEnvironments() {
  const promises = [];
  const cmd = `${MC_CLI} projects --pipe | head -5`;
  const {stdout, stderr} = await exec(cmd);
  if (stderr) {
    throw stderr;
  }
  const projects = stdout.trim().split('\n');
  projects.forEach((project) => {
    promises.push(limit(() => {
      exec(`${MC_CLI} environment:delete -p ${project} --inactive --no-wait -y`)
        .catch( error => {
          console.error(error);
        });
    }));
  });
  //const result = await Promise.all(promises);
  //console.log(result);
}


updateAllCurrentProjectsEnvironmentsFromAPI();
