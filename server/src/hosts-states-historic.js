const {db} = require('../util/common')

module.exports = (req, res) => {
  // over time, environments could migrate hosts as a project's environment is deleted & recreated 
  // (or perhaps rebalanced on the infrastructure)
  // this could create inaccurate historic charts but hopefully is rare especially for masters
  // which can not be deleted
  const days = isNaN(req.query.days) ? 1 : req.query.days
  const sql = `SELECT host_id, region, cpus, load_avg_15, timestamp
    FROM
      (
      SELECT project_id || ':' || environment_id proj_env_id, region, boot_time, cpus, ip, load_avg_15, hs.timestamp
      FROM hosts_states hs 
      LEFT JOIN projects p ON p.id = hs.project_id
      ) hs
    LEFT JOIN matched_envs_hosts m ON m.proj_env_id = hs.proj_env_id
    WHERE timestamp > (strftime('%s','now') - ${days}*24*60*60)`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
