const {exec, execOutputHandler, db, logger, parseFormattedCmdOutputIntoDB } = require('./common')
const {getSshCmd} = require('./environment')

exports.updateHost = async (project, environment = 'master') => {
  const cmd = `${await getSshCmd(project, environment)} '
    echo boot_time $(cat /proc/stat | sed -n "s/btime //p")
    # netstat not available on all containers
    # echo ip $(netstat -r | perl -ne "s/default *([\\d\\.]*).*/\\1/ and print")
    echo ip $(cat /proc/net/arp | sed -n "/eth0/ s/ .*//p")
    echo total_memory $(cat /proc/meminfo | sed -n "s/ kB//;s/MemTotal: *//p")
    echo cpus $(nproc)
    read load_avg_1 load_avg_5 load_avg_15 running_processes total_processes last_process_id <<<$(cat /proc/loadavg |
      tr "/" " ")
    echo load_avg_1 $load_avg_1
    echo load_avg_5 $load_avg_5
    echo load_avg_15 $load_avg_15
    echo running_processes $running_processes
    echo total_processes $total_processes
    echo last_process_id $last_process_id'`
  const result = exec(cmd)
    .then(execOutputHandler)
    .then(({stdout, stderr}) => {
      parseFormattedCmdOutputIntoDB(stdout, 'hosts_states', ['project_id', 'environment_id'], [project, environment])
      logger.mylog('info', `Host of env: ${environment} of project: ${project} updated.`)
    })
    .catch(error => logger.mylog('error', error))
  return result
}

exports.getSampleEnvs = async () => {
  // prefer master envs b/c masters can not be deleted and so can't be recreated on new host
  // can still be rebalanced/migrated if enabled by infrastructure
  const sql = `SELECT proj_env_id FROM 
      (SELECT proj_env_id, host_id, instr(proj_env_id, ':master') is_master 
      FROM matched_envs_hosts ORDER BY is_master ASC) 
    GROUP BY host_id`
  const result = db.prepare(sql).all().map(row => row.proj_env_id)
  logger.mylog('debug', result)
  return result
}

// this method allows us to reduce the performance queries.
// by occasionally querying all the envs and then mapping envs
// to specific hosts based on the same boot time, # cpus, and ip address,
// on subsequent queries, just query one representative env per host
exports.updateEnvHostRelationships = () => {
  // since all of a project's environments are no longer constrained to a single host,
  // track environments by a project:environment pair to have a unique identifier
  const envHosts = {} // a dictionary to lookup each env's host
  let hostsEnvs = [] // list of envs associated with each host

  // identify cotenants - envs grouped by same boot time, # cpus, & ip address
  // ordered by region to keep hosts in the same region together when enumerated
  // using only the most recent result since environments can migrate across hosts over time
  let cotenantGroups = db
    .prepare(
      `SELECT GROUP_CONCAT(id) cotenant_group, boot_time, cpus, ip 
      FROM
        (SELECT project_id || ':' || environment_id id, boot_time, cpus, ip, MAX(h.timestamp) timestamp, region
        FROM hosts_states h
        LEFT JOIN projects p ON p.id = h.project_id
        GROUP BY project_id, environment_id)
      GROUP BY boot_time, cpus, ip
      ORDER BY region`
    )
    .all()
  logger.mylog('debug', cotenantGroups)
  cotenantGroups = cotenantGroups.map(row => row['cotenant_group'].split(','))
  // since hosts reboot and then are assigned new IPs, upsized, etc., the groupings based on those values are incomplete
  // however, envs should not migrate from hosts often (ever?)
  // so any env cotenancy can be merged with another if they share a host
  cotenantGroups.forEach(group => {
    let hostsThatAreActuallyTheSame = []
    const nextNewHostIndex = hostsEnvs.length
    group.forEach(cotenant => {
      hostsThatAreActuallyTheSame.push(
        typeof envHosts[cotenant] === 'undefined' ? nextNewHostIndex : envHosts[cotenant]
      )
    })
    hostsThatAreActuallyTheSame = [...new Set(hostsThatAreActuallyTheSame)].sort((a, b) => {
      return b - a
    }) // uniqify & in descending order to reduce operations
    const minHost = Math.min(...hostsThatAreActuallyTheSame)
    if (minHost === nextNewHostIndex) {
      // no cotenants were found on an existing host, append new host with these cotenants
      hostsEnvs[nextNewHostIndex] = group
      group.forEach(cotenant => (envHosts[cotenant] = nextNewHostIndex))
    } else {
      // add the cotenants to the minHost
      hostsEnvs[minHost] = hostsEnvs[minHost].concat(group)
      group.forEach(cotenant => (envHosts[cotenant] = minHost))
      // combine with envs from the other hosts in hostsThatAreActuallyTheSame
      // set the combined list of envs to the host with the lowest index
      hostsThatAreActuallyTheSame.forEach(curHostIndex => {
        if (curHostIndex !== minHost) {
          if (curHostIndex !== nextNewHostIndex) {
            hostsEnvs[minHost] = hostsEnvs[minHost].concat(hostsEnvs[curHostIndex])
            // remove host that was combined
            hostsEnvs = hostsEnvs.filter((envs, index) => index !== curHostIndex)
            Object.entries(envHosts).forEach(([env, prevHostIndex]) => {
              if (prevHostIndex === curHostIndex) {
                // find envs with this host index
                envHosts[env] = minHost // update to the new host index
              } else if (prevHostIndex > curHostIndex) {
                // since 1 less host, decrement any index above the old one
                envHosts[env] = envHosts[env] - 1
              }
            })
          }
        }
      })
      // finally, uniqify cotenants
      hostsEnvs[minHost] = [...new Set((hostsEnvs[minHost] || []).concat(group))]
    }
  })
  const insertValues = []
  Object.entries(envHosts).forEach(([projEnvId, hostId]) => insertValues.push(`("${projEnvId}", ${hostId})`))
  const sql = `DELETE FROM matched_envs_hosts; 
    INSERT INTO matched_envs_hosts (proj_env_id, host_id) VALUES ${insertValues.join(',')}`
  const result = db.exec(sql)
  logger.mylog('info', `${Object.keys(envHosts).length} envs matched to ${hostsEnvs.length} hosts.`)
  logger.mylog('debug', result)
  return result
}
