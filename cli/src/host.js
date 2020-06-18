const {exec, execOutputHandler, db, logger, parseFormattedCmdOutputIntoDB} = require('./common')
const {getSshCmd, updateEnvironmentFromApi} = require('./environment')

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
      parseFormattedCmdOutputIntoDB(stdout, 'hosts_states', false, ['project_id', 'environment_id'], [project, environment])
      logger.mylog('info', `Host of env: ${environment} of project: ${project} updated.`)
      return true
    })
    .catch(error => {
      if (/exist or you do not have access/.test(error.stderr)) {
        return updateEnvironmentFromApi(project, environment)
      }
      logger.mylog('error', error)
    })
  return result
}
exports.updateHost = updateHost

const getSampleEnvs = () => {
  // prefer master envs (and ensure active projects) b/c masters can not be deleted
  // can still be rebalanced/migrated to another host though
  // length col accounts for rare case where env name begins with substring "master"
  const sql = `SELECT pe.proj_env_id FROM
      (SELECT proj_env_id, substr(proj_env_id, 0, instr(proj_env_id,':')) pid FROM 
          (SELECT proj_env_id, host_id, instr(proj_env_id, ':master') is_master, length(proj_env_id) length
          FROM matched_envs_hosts ORDER BY is_master ASC, length DESC) 
        GROUP BY host_id) pe
    INNER JOIN projects p 
    WHERE p.active = 1
      AND pe.pid= p.id`
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

  let cotenantGroups = getCotenantGroups().filter(row => row['cotenants'] !== null).map(row => row['cotenants'].split(','))
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
  // identify cotenants: currently active envs on the same host when they were last checked since
  // their boot time, # cpus, & ip address were the same at that time.
  // (ordered by region to keep hosts in the same region together when enumerated)
  const sql = `SELECT region, GROUP_CONCAT(hs.proj_env_id) cotenants, hs.cpus, hs.boot_time, hs.ip, hs.load_avg_15, 
  cast (hs.load_avg_15 * 100 / hs.cpus as int) utilization, max(hs.timestamp) timestamp
FROM 

(SELECT hs.*, pe.region FROM
/* the most recent query from each env in hs */
( SELECT project_id || ':' || environment_id proj_env_id, cpus, boot_time, ip, load_avg_15, max(timestamp) timestamp 
FROM hosts_states
GROUP BY project_id, environment_id ORDER BY timestamp DESC) hs
LEFT JOIN 
/* projects' environments with regions*/
(SELECT e.id environment_id, project_id, region 
  FROM environments e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.active = 1
    AND p.active = 1
    AND e.missing = 0
    AND (e.failure = 0 OR e.failure IS null)
  ) pe
ON pe.project_id || ':' || pe.environment_id = proj_env_id
WHERE pe.region is not null) hs

WHERE timestamp is not null
GROUP BY boot_time, cpus, ip
ORDER BY region, cotenants`

  const cotenantGroups = db.prepare(sql).all()
  logger.mylog('debug', cotenantGroups)
  return cotenantGroups
}
exports.getCotenantGroups = getCotenantGroups
