const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const Database = require('better-sqlite3');
const db = new Database('sql/cloud.db');
const pLimit = require('p-limit');
const sshLimit = pLimit(10);
const MC_CLI = '~/.magento-cloud/bin/magento-cloud';
const { setEnvironmentInactive } = require('./environment.js');

function updateApplicationState(project, environment = 'master') {
  const cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    egrep -m 1 'magento/product-enterprise-edition\\":|\\"2\\.[0-9]\\.[0-9]\\.x-dev' composer.lock || echo 'not found'
    md5sum composer.lock
    stat -t composer.lock | awk '{print \\$12}'"`;
  return exec(cmd)
    .then(({ stdout, stderr}) => {
      if (stderr) {
        throw stderr;
      }
      let [ EEComposerVersion, composerLockMd5, composerLockMtime ] = stdout.trim().split('\n');
      EEComposerVersion = EEComposerVersion.replace(/.*: "/,'').replace(/".*/,'');
      composerLockMd5 = composerLockMd5.replace(/ .*/,'');
      db.prepare(`INSERT INTO applications_states (project_id, environment_id, ee_composer_version, composer_lock_md5, composer_lock_mtime) 
        VALUES (?, ?, ?, ?, ?);`)
        .run(project, environment, EEComposerVersion, composerLockMd5, composerLockMtime);
    })
    .catch( error => {
      if (/Specified environment not found/.test(error.stderr)) {
        setEnvironmentInactive(project, environment);
      }
      console.error(error);
    });
}

async function updateAllApplicationStates() {
  const promises = [];
  db.prepare('select id, project_id from environments where active = 1 limit 5').all()
    .forEach(({id: environment, project_id: project}) => {
      //console.log(environment, project);
      promises.push(sshLimit(() => updateApplicationState(project, environment)));
    });
  //const result = await Promise.all(promises);
  //console.log(result);
}

updateAllApplicationStates();
