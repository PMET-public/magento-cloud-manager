const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');
const db = new Database('sql/cloud.db');
const pLimit = require('p-limit');
const limit = pLimit(5);
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';

function updateProject (projectRow) {
  const [id, title, projectUrl] = projectRow.trim().split('\t');
  const region = projectUrl.replace(/.*\/\//, '').replace(/\..*/, '');
  return exec(
    `${MC_CLI} project:info -p ${id} --format=tsv`
  ).then( ({ stdout }) => {
    const projectInfo = stdout;
    const gitUrl = projectInfo.replace(/[\s\S]*url: '([^']*)'[\s\S]*/, '$1');
    const createdAt = Date.parse(projectInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/, '$1')) / 1000;
    const clientSshKey = projectInfo.replace(/[\s\S]*client_ssh_key: '([^']*)[\s\S]*/, '$1');
    const planSize = projectInfo.replace(/[\s\S]*plan: ([^\s]*)[\s\S]*/, '$1');
    const allowedEnvironments = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/, '$1');
    const storage = projectInfo.replace(/[\s\S]*storage: ([^\n]*)[\s\S]*/, '$1');
    const userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/, '$1');
    db.prepare(`INSERT OR REPLACE INTO projects (id, title, region, project_url, git_url, created_at, plan_size,
      allowed_environments, storage, user_licenses, active, client_ssh_key) VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, region, projectUrl, gitUrl, createdAt, planSize, allowedEnvironments, storage, userLicenses, 1, clientSshKey);
  }).catch( error => {
    console.error(error);
  });
}

function updateProjects() {
  //mark all projects inactive; the api call will then update only active ones
  db.prepare('UPDATE projects SET active = 0;').run();
  exec(
    `${MC_CLI} projects --format=tsv`
  ).then( async ({ stdout }) => {
    const projectRows = stdout.trim().split('\n');
    const projectPromises = [];
    projectRows.shift();
    projectRows.forEach((row) => {
      projectPromises.push(limit(() => updateProject(row)));
    });
    const result = await Promise.all(projectPromises);
    console.error(result);
  }).catch( error => {
    console.error(error);
  });
}

updateProjects();
