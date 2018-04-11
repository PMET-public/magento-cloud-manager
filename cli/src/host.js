const {exec, execOutputHandler, db, logger, parseFormattedCmdOutputIntoDB} = require('./common')
const {getSshCmd, updateEnvironment} = require('./environment')

const updateHost = async (project, environment = 'master') => {
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
      return true
    })
    .catch(error => {
      if (/exist or you do not have access/.test(error.stderr)) {
        return updateEnvironment(project, environment)
      }
      logger.mylog('error', error)
    })
  return result
}
exports.updateHost = updateHost

const getSampleEnvs = () => {
  // prefer master envs b/c masters can not be deleted and so can't be recreated on new host
  // can still be rebalanced/migrated to another host though
  // length col accounts for rare case where env name begins with substring "master"
  const sql = `SELECT proj_env_id FROM 
      (SELECT proj_env_id, host_id, instr(proj_env_id, ':master') is_master, length(proj_env_id) length
      FROM matched_envs_hosts ORDER BY is_master ASC, length DESC) 
    GROUP BY host_id`
  const result = db
    .prepare(sql)
    .all()
    .map(row => row.proj_env_id)
  logger.mylog('debug', result)
  return result
}
exports.getSampleEnvs = getSampleEnvs

// this method enables us to reduce the # of queries for performance monitoring.
// by mapping envs to specific hosts based on the same boot time, # cpus, and ip address,
// and then further reducing the list by combining any previous cotenant groups that share an env
// we can just query one representative env per host on subsequent queries.
const updateEnvHostRelationships = () => {
  const envHosts = {} // a dictionary to lookup each env's host
  let hostsEnvs = [] // list of envs associated with each host

  let cotenantGroups = getCotenantGroups().map(row => row['cotenant_group'].split(','))
  // since hosts reboot and then are assigned new IPs, upsized, etc.,
  // groupings based on just those values (getCotenantGroups()) are incomplete
  // however, envs should not migrate from hosts often (ever?)
  // so any env cotenancy can be merged with another if an env is shared between the cotenancy
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
  logger.mylog('debug', result)
  logger.mylog('info', `${Object.keys(envHosts).length} envs matched to ${hostsEnvs.length} hosts.`)
  return result
}
exports.updateEnvHostRelationships = updateEnvHostRelationships

const getCotenantGroups = () => {
  // identify cotenants - envs on the same host when they were last checked since
  // their boot time, # cpus, & ip address were the same at that time.
  // (ordered by region to keep hosts in the same region together when enumerated)
  const sql = `SELECT GROUP_CONCAT(h.project_id || ':' || h.environment_id) cotenant_group,
    cast (h.load_avg_15 * 100 / h.cpus as int) utilization,
      load_avg_15, cpus, boot_time, ip, h.timestamp, region
    FROM
      (SELECT id, project_id FROM environments e
      WHERE active = 1 AND missing = 0 AND (failure = 0 OR failure IS null)) e
    LEFT JOIN 
      (SELECT project_id, environment_id, load_avg_15, cpus, boot_time, ip, MAX(timestamp) timestamp
      FROM hosts_states h GROUP BY project_id, environment_id) h 
    ON e.id = h.environment_id AND e.project_id = h.project_id
    LEFT JOIN projects p on p.id = h.project_id
    GROUP BY boot_time, cpus, ip
    ORDER BY region, cotenant_group`
  const cotenantGroups = db.prepare(sql).all()
  logger.mylog('debug', cotenantGroups)
  return cotenantGroups
}
exports.getCotenantGroups = getCotenantGroups
