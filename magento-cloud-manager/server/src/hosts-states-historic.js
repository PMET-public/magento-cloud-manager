const {db} = require('../util/common')

module.exports = (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.title, p.region, project_id, load_avg_15, cpus, h.timestamp 
        FROM hosts_states h LEFT JOIN projects p ON h.project_id = p.id`
    )
    .all()
  res.json(rows)
}
