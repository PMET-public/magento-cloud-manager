const {exec, db, apiLimit, sshLimit, MC_CLI, winston} = require('./common')
const {getProjectsFromApi} = require('./project')

function updateHost(project, environment = 'master') {
  return exec(`${MC_CLI} ssh -p ${project} -e "${environment}" "
    cat /proc/stat | awk '/btime/ {print \\$2}'
    cat /proc/net/route | awk '/eth0	00000000	/ {print \\$3}'
    cat /proc/meminfo | awk '/MemTotal/ {print \\$2 }'
    nproc
    cat /proc/loadavg"`)
    .then(({stdout, stderr}) => {
      if (stderr) {
        throw stderr
      }
      const [bootTime, hexIpAddr, totalMemory, cpus, loadAvg] = stdout.trim().split('\n')
      const ipAddr = hexIpAddr
        .match(/../g)
        .reverse()
        .map(hex => {
          return parseInt(hex, 16)
        })
        .join('.')
      const [loadAvg1, loadAvg5, loadAvg15, runningProcesses, totalProcesses, lastPID] = loadAvg
        .replace('/', ' ')
        .trim()
        .split(' ')
      return db
        .prepare(
          `INSERT INTO hosts_states (project_id, environment_id, boot_time, ip, total_memory, cpus, load_avg_1, 
          load_avg_5, load_avg_15, running_processes, total_processes, last_process_id) VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .run(
          project,
          environment,
          bootTime,
          ipAddr,
          totalMemory,
          cpus,
          loadAvg1,
          loadAvg5,
          loadAvg15,
          runningProcesses,
          totalProcesses,
          lastPID
        )
    })
    .catch(error => {
      winston.error(error)
    })
}

async function updateHostsUsingAllProjects() {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(sshLimit(() => updateHost(project)))
  })
  return await Promise.all(promises)
}

async function updateHostsUsingSampleProjects() {
  const promises = []
  // get a list of projects on the same host (detected by same boot time, # cpus, & ip address)
  const groupedProjects = db
    .prepare(
      `SELECT GROUP_CONCAT(DISTINCT p.id) projects FROM hosts_states h LEFT JOIN 
    projects p ON h.project_id = p.id GROUP BY h.boot_time, h.cpus, h.ip`
    )
    .all()
  for (let {projects} of groupedProjects) {
    promises.push(
      sshLimit(async () => {
        // cycle through the grouped hosts until able to update 1
        for (let project of projects.split(',')) {
          const result = await updateHost(project)
          if (result.changes) {
            break
          }
        }
      })
    )
  }
}

exports.updateHost = updateHost
exports.updateHostsUsingAllProjects = updateHostsUsingAllProjects
exports.updateHostsUsingSampleProjects = updateHostsUsingSampleProjects
