const {
  exec,
  execOutputHandler,
  db,
  apiLimit,
  sshLimit,
  MC_CLI,
  logger,
  parseFormattedCmdOutputIntoDB
} = require('./common')
const {getProjectsFromApi} = require('./project')

exports.updateHost = (project, environment = 'master') => {
  return exec(`${MC_CLI} ssh -p ${project} -e "${environment}" '
      echo boot_time $(cat /proc/stat | sed -n "s/btime //p")
      echo ip $(netstat -r | perl -ne "s/default *([\\d\\.]*).*/\\1/ and print")
      echo total_memory $(cat /proc/meminfo | sed -n "s/ kB//;s/MemTotal: *//p")
      echo cpus $(nproc)
      read load_avg_1 load_avg_5 load_avg_15 running_processes total_processes last_process_id <<<$(cat /proc/loadavg |
         tr "/" " ")
      echo load_avg_1 $load_avg_1
      echo load_avg_5 $load_avg_5
      echo load_avg_15 $load_avg_15
      echo running_processes $running_processes
      echo total_processes $total_processes
      echo last_process_id $last_process_id
    '`)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      parseFormattedCmdOutputIntoDB(stdout, 'hosts_states', ['project_id', 'environment_id'], [project, environment])
      logger.mylog('info', `Host updated.`)
    })
    .catch(error => {
      logger.mylog('error', error)
    })
}

exports.updateHostsUsingAllProjects = async () => {
  const promises = []
  ;(await getProjectsFromApi()).forEach(project => {
    promises.push(sshLimit(() => exports.updateHost(project)))
  })
  return await Promise.all(promises)
}

exports.updateHostsUsingSampleProjects = async () => {
  const promises = []
  const result = db.prepare('SELECT MIN(project_id) project FROM matched_projects_hosts GROUP BY id').all()
  logger.mylog('debug', result)
  result.forEach(row => {
    promises.push(sshLimit(() => exports.updateHost(row.project)))
  })
  return await Promise.all(promises)
}

exports.updateProjectHostRelationships = () => {
  const promises = []
  const projectHosts = {} // a dictionary to lookup each project's host
  let hostsProjects = [] // list of projects associated with each host

  // identify cotenants - projects grouped by same boot time, # cpus, & ip address
  let cotenantGroups = db
    .prepare(
      `SELECT GROUP_CONCAT(p.id) cotenant_groups, boot_time, cpus, ip
      FROM 
        (SELECT project_id, boot_time, cpus, ip, MAX(timestamp) 
          FROM hosts_states WHERE environment_id = 'master' GROUP BY project_id) AS h
      LEFT JOIN projects p ON h.project_id = p.id
      GROUP BY h.boot_time, h.cpus, h.ip`
    )
    .all()
  logger.mylog('debug', cotenantGroups)
  cotenantGroups = cotenantGroups.map(row => row['cotenant_groups'].split(','))
  // since hosts reboot, are assigned new IPs, upsized, etc., the groupings based on those values are incomplete
  // however, projects should not migrate from hosts often (ever?)
  // so any project cotenancy can be merged with another if they share a host
  cotenantGroups.forEach(cotenants => {
    let hostsThatAreActuallyTheSame = []
    const nextNewHostIndex = hostsProjects.length
    cotenants.forEach(cotenant => {
      hostsThatAreActuallyTheSame.push(
        typeof projectHosts[cotenant] === 'undefined' ? nextNewHostIndex : projectHosts[cotenant]
      )
    })
    hostsThatAreActuallyTheSame = [...new Set(hostsThatAreActuallyTheSame)].sort((a, b) => {
      return b - a
    }) // uniqify & in descending order to reduce operations
    const minHost = Math.min(...hostsThatAreActuallyTheSame)
    if (minHost === nextNewHostIndex) {
      // no cotenants were found on an existing host, append new host with these cotenants
      hostsProjects[nextNewHostIndex] = cotenants
      cotenants.forEach(cotenant => (projectHosts[cotenant] = nextNewHostIndex))
    } else {
      // add the contenants to the minHost
      hostsProjects[minHost] = hostsProjects[minHost].concat(cotenants)
      cotenants.forEach(cotenant => (projectHosts[cotenant] = minHost))
      // combine with projects from the other hosts in hostsThatAreActuallyTheSame
      // set the combined list of projects to the host with the lowest index
      hostsThatAreActuallyTheSame.forEach(curHostIndex => {
        if (curHostIndex !== minHost) {
          if (curHostIndex !== nextNewHostIndex) {
            hostsProjects[minHost] = hostsProjects[minHost].concat(hostsProjects[curHostIndex])
            // remove host that was combined
            hostsProjects = hostsProjects.filter((projects, index) => index !== curHostIndex)
            Object.entries(projectHosts).forEach(([project, prevHostIndex]) => {
              if (prevHostIndex === curHostIndex) {
                // find projects with this host index
                projectHosts[project] = minHost // update to the new host index
              } else if (prevHostIndex > curHostIndex) {
                // since 1 less host, decrement any index above the old one
                projectHosts[project] = projectHosts[project] - 1
              }
            })
          }
        }
      })
      // finally, uniqify cotenants
      hostsProjects[minHost] = [...new Set((hostsProjects[minHost] || []).concat(cotenants))]
    }
  })
  const insertValues = []
  Object.entries(projectHosts).forEach(([projectId, hostId]) => insertValues.push(`(${hostId},"${projectId}")`))
  const result = db.exec(
    `DELETE FROM matched_projects_hosts; INSERT INTO matched_projects_hosts (id, project_id) VALUES ${insertValues.join(
      ','
    )}`
  )
  logger.mylog('debug', result)
  return result
}
