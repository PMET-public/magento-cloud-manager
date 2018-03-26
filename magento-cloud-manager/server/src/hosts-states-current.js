const {db} = require('../util/common')

module.exports = (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.host_id, GROUP_CONCAT(hs.proj_env_id) cotenants, hs.*, cast (hs.load_avg_15 * 100 / hs.cpus as int) utilization
      FROM
        ( /* the most recent query from each env */
        SELECT project_id || ':' || environment_id proj_env_id, region, boot_time, cpus, ip, load_avg_15, hs.timestamp
        FROM hosts_states hs 
        /* join w/ projects to get region */
        LEFT JOIN projects p ON p.id = hs.project_id
        GROUP BY proj_env_id
        ORDER BY hs.timestamp ASC
        ) hs
      LEFT JOIN matched_envs_hosts m ON m.proj_env_id = hs.proj_env_id
      GROUP BY host_id
      ORDER BY timestamp ASC`
    )
    .all()
  res.json(rows)
}
