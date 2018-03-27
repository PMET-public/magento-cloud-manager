const {db} = require('../util/common')

module.exports = (req, res) => {
  // over time, environments could migrate hosts as a project's environment is deleted & recreated (or perhaps
  // rebalanced on the infrastructure)
  // this could create inaccurate historic charts but should is hopefully rare event especially for masters which should
  // can not be deleted
  const days = isNaN(req.query.days) ? 1 : req.query.days
  const rows = db
    .prepare(
      `SELECT host_id, region, cpus, load_avg_15, timestamp
      FROM
        (
        SELECT project_id || ':' || environment_id proj_env_id, region, boot_time, cpus, ip, load_avg_15, hs.timestamp
        FROM hosts_states hs 
        LEFT JOIN projects p ON p.id = hs.project_id
        ) hs
      LEFT JOIN matched_envs_hosts m ON m.proj_env_id = hs.proj_env_id
      WHERE timestamp > (strftime('%s','now') - ${days}*24*60*60)`
    )
    .all()
  res.json(rows)
}
