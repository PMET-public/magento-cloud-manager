const {db} = require('../util/common')

module.exports = (req, res) => {
  const sql = `SELECT p.region, p.title, project_id, environment_id, ee_composer_version, http_status, 
      store_url_uncached, cat_url_uncached, utilization_start, utilization_end 
    FROM smoke_tests s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE http_status = 302 
      AND ee_composer_version IS NOT null 
      AND store_url_uncached > 1 
      AND cat_url_uncached > 1
      AND ee_composer_version = '2.2.2'`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
