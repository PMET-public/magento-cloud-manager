const {db} = require('../util/common')

module.exports = (req, res) => {
  const rows = db
    .prepare('SELECT project_id, load_avg_15, cpus, timestamp from hosts_states order by project_id limit 100')
    .all()
  res.json(rows)
}
