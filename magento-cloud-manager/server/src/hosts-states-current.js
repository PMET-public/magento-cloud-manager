const {db} = require('../util/common')

module.exports = (req, res) => {
  const rows = db
    .prepare(
      `SELECT GROUP_CONCAT(p.title || ' (' || p.id || ')' ) projects, region, cpus,
        cast(avg(h.load_avg_15) as int) load, cast ((avg(h.load_avg_15) *100 / h.cpus) as int) utilization
      FROM 
        (SELECT project_id, boot_time, cpus, ip, load_avg_15, MAX(timestamp) 
          FROM hosts_states WHERE environment_id = 'master' GROUP BY project_id) AS h
      LEFT JOIN projects p ON h.project_id = p.id
      GROUP BY h.boot_time, h.cpus, h.ip`
    )
    .all()
  res.json(rows)
}
