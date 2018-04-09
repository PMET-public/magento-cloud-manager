const {db} = require('../util/common')

module.exports = (req, res) => {
  // const sql = `SELECT * FROM 
  //     (SELECT m.host_id, GROUP_CONCAT(hs.proj_env_id) cotenants, hs.*, cast (hs.load_avg_15 * 100 / hs.cpus as int) utilization
  //     FROM
  //       ( /* the most recent query from each env */
  //       SELECT project_id || ':' || environment_id proj_env_id, region, boot_time, cpus, ip, load_avg_15, hs.timestamp
  //       FROM hosts_states hs 
  //       /* join w/ projects to get region */
  //       LEFT JOIN projects p ON p.id = hs.project_id
  //       GROUP BY proj_env_id
  //       ORDER BY hs.timestamp ASC
  //       ) hs
  //     LEFT JOIN matched_envs_hosts m ON m.proj_env_id = hs.proj_env_id
  //     GROUP BY host_id
  //     ORDER BY timestamp ASC)
  //   ORDER BY region`
  const sql = `SELECT m.host_id, region, GROUP_CONCAT(m.proj_env_id) cotenants, hs.cpus, hs.load_avg_15, 
      cast (hs.load_avg_15 * 100 / hs.cpus as int) utilization, max(hs.timestamp) timestamp
    FROM matched_envs_hosts m
    LEFT JOIN
      ( /* the most recent query from each env */
      SELECT project_id || ':' || environment_id proj_env_id, region, cpus, load_avg_15, max(hs.timestamp) timestamp 
      FROM hosts_states hs 
      /* join w/ projects to get region */
      LEFT JOIN projects p ON p.id = hs.project_id
      GROUP BY project_id, environment_id ORDER BY timestamp DESC) hs 
    ON hs.proj_env_id = m.proj_env_id
    GROUP BY host_id`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
