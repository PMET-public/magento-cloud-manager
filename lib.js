const util = require('util');
const exec = util.promisify(require('child_process').exec);
const MC_CLI = "~/.magento-cloud/bin/magento-cloud";
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('sql/cloud.db');

function updateProjects() {

  //mark all projects inactive; the api call will then update only active ones
  var sql = 'UPDATE projects SET active = 0;';
  db.exec(sql);
  var cmd = `${MC_CLI} projects --format=tsv`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.log("Error executing: ", cmd);
      throw err;
    }
    var projectRows = stdout.trim().split('\n');
    projectRows.shift();
    projectRows.forEach((projectRow) => {
      var [ id, title, projectUrl ] = projectRow.trim().split('\t');
      var region = projectUrl.replace(/.*\/\//,'').replace(/\..*/,'');
      var cmd = `${MC_CLI} project:info -p ${id} --format=tsv`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.log("Error executing: ", cmd);
          throw err;
        }
        var projectInfo = stdout;
        var gitUrl = projectInfo.replace(/[\s\S]*url: '([^']*)'[\s\S]*/,'$1');
        var createdAt = Date.parse(projectInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
        var clientSshKey = projectInfo.replace(/[\s\S]*client_ssh_key: '([^']*)[\s\S]*/,'$1');
        var planSize = projectInfo.replace(/[\s\S]*plan: ([^\s]*)[\s\S]*/,'$1');
        var allowedEnvironments = projectInfo.replace(/[\s\S]*environments: ([^\n]*)[\s\S]*/,'$1');
        var storage = projectInfo.replace(/[\s\S]*storage: ([^\n]*)[\s\S]*/,'$1');
        var userLicenses = projectInfo.replace(/[\s\S]*user_licenses: ([^"]*)[\s\S]*/,'$1');
        var sql = `INSERT OR REPLACE INTO projects (id, title, region, project_url, git_url, created_at, plan_size, allowed_environments, storage, user_licenses, active, client_ssh_key) VALUES
          ("${id}", "${title}", "${region}", "${projectUrl}", "${gitUrl}", ${createdAt}, "${planSize}", ${allowedEnvironments}, ${storage}, ${userLicenses}, 1, "${clientSshKey}");`;
        db.exec(sql, (err) => {
          if (err) {
            console.log("Error executing: ", sql);
            throw err;
          }
        });
      });
    });
  });

}

function updateHost(project, environment = "master") {
  var cmd = `${MC_CLI} ssh -p ${project} -e "${environment}" "
    cat /proc/stat | awk '/btime/ {print \\$2}'
    cat /proc/net/route | awk '/eth0	00000000	/ {print \\$3}'
    cat /proc/meminfo | awk '/MemTotal/ {print \\$2 }'
    nproc
    cat /proc/loadavg
  "`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.log("Error executing: ", cmd);
      throw err;
    }
    var [ bootTime, hexIpAddr, totalMemory, cpus, loadAvg ] = stdout.trim().split('\n');
    var ipAddr = hexIpAddr.match(/../g).reverse().map((hex) => {return parseInt(hex,16)}).join('.');
    var [ loadAvg1, loadAvg5, loadAvg15, runningProcesses, totalProcesses, lastPID ] = loadAvg.replace('/',' ').trim().split(' ');
    var sql = `INSERT INTO hosts_states (project_id, environment_id, boot_time, ip, total_memory, cpus, load_avg_1, load_avg_5, load_avg_15, running_processes, total_processes, last_process_id) VALUES
      ("${project}", "${environment}", ${bootTime}, "${ipAddr}", ${totalMemory}, ${cpus}, ${loadAvg1}, ${loadAvg5}, ${loadAvg15}, ${runningProcesses}, ${totalProcesses}, ${lastPID});`;
    db.exec(sql, (err) => {
      if (err) {
        console.log("Error executing: ", sql);
        throw err;
      }
    });
  });
}

//updateHost('j7mn26kjab6my');


function updateEnvironments() {
  var cmd = `${MC_CLI} projects --pipe | head -10`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.log("Error executing: ", cmd);
      throw err;
    }
    var projects = stdout.trim().split('\n');
    projects.forEach((project) => {
      var cmd = `${MC_CLI} environments -p ${project} --pipe`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.log("Error executing: ", cmd);
          throw err;
        }
        var environments = stdout.trim().split('\n');
        environments.forEach((environment) => {
          var cmd = `${MC_CLI} environment:info -p ${project} -e "${environment}" --format=tsv`;
          exec(cmd, (err, stdout, stderr) => {
            if (err) {
              console.log("Error executing: ", cmd);
              throw err;
            }
            environmentInfo = stdout;
            var title = environmentInfo.replace(/[\s\S]*title\s*([^\n]+)[\s\S]*/,'$1').replace(/"/g,'');
            var active = /\nstatus\s+active/.test(environmentInfo) ? 1 : 0;
            var createdAt = Date.parse(environmentInfo.replace(/[\s\S]*created_at\t(\S*)[\s\S]*/,'$1')) / 1000;
            var sql = `INSERT OR REPLACE INTO environments (id, project_id, title, active, created_at) VALUES
              ("${environment}", "${project}", "${title}", ${active}, ${createdAt});`;
            db.exec(sql, (err) => {
              if (err) {
                console.log("Error executing: ", sql);
                throw err;
              }
            });
          });
        });
      });
    });
  }).then((err) => {
    console.log('a')
  }).catch((err) => {
    // Handle the error.
    console.log('c')
  });
  console.log('b')
}


function deleteInactiveEnvironments() {

  var cmd = `${MC_CLI} projects --pipe`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.log("Error executing: ", cmd);
      throw err;
    }
    var projects = stdout.trim().split('\n');
    projects.forEach((project) => {
      var cmd = `${MC_CLI} environment:delete -p ${project} --inactive --no-wait -y`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.log("Error executing: ", cmd);
          throw err;
        }
      });
    });
  });

}

updateEnvironments();

//updateProjects();


//db.close();


