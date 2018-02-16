const {exec, db, apiLimit, sshLimit, MC_CLI, winston} = require('./common');
const { getProjectsFromApi } = require('./project');

function updateHost(project, environment = 'master') {
  return exec(`${MC_CLI} ssh -p ${project} -e "${environment}" "
    cat /proc/stat | awk '/btime/ {print \\$2}'
    cat /proc/net/route | awk '/eth0	00000000	/ {print \\$3}'
    cat /proc/meminfo | awk '/MemTotal/ {print \\$2 }'
    nproc
    cat /proc/loadavg"`)
    .then(({ stdout, stderr }) => {
      if (stderr) {
        winston.error(stderr);
        throw stderr;
      }
      const [ bootTime, hexIpAddr, totalMemory, cpus, loadAvg ] = stdout.trim().split('\n');
      const ipAddr = hexIpAddr.match(/../g).reverse().map((hex) => {return parseInt(hex,16);}).join('.');
      const [ loadAvg1, loadAvg5, loadAvg15, runningProcesses, totalProcesses, lastPID ] = loadAvg.replace('/',' ').trim().split(' ');
      db.prepare(`INSERT INTO hosts_states (project_id, environment_id, boot_time, ip, total_memory, cpus, load_avg_1, 
          load_avg_5, load_avg_15, running_processes, total_processes, last_process_id) VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`)
        .run(project, environment, bootTime, ipAddr, totalMemory, cpus, loadAvg1, loadAvg5, loadAvg15, runningProcesses, totalProcesses, lastPID);
    });
}

async function updateHostsForAllProjects() {
  const promises = [];
  (await getProjectsFromApi()).forEach(project => {
    promises.push(sshLimit(() => updateHost(project)));
  });
  return await Promise.all(promises);
}

exports.updateHost = updateHost;
exports.updateHostsForAllProjects = updateHostsForAllProjects;

