const {db} = require('../util/common')

module.exports = (req, res) => {
  const sql = `SELECT m.host_id, region, GROUP_CONCAT(m.proj_env_id) cotenants, hs.cpus, hs.boot_time, hs.ip, hs.load_avg_15, 
      cast (hs.load_avg_15 * 100 / hs.cpus as int) utilization, max(hs.timestamp) timestamp
    FROM matched_envs_hosts m
    LEFT JOIN

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
      AND e.missing = 0
      AND p.active = 1
    ) pe
    ON pe.project_id || ':' || pe.environment_id = proj_env_id
    WHERE pe.region is not null) hs

    ON hs.proj_env_id = m.proj_env_id
    WHERE timestamp is not null
    GROUP BY host_id`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
