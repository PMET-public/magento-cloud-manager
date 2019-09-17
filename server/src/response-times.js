const {db} = require('../util/common')

module.exports = (req, res) => {
  const sql = `SELECT p.region, p.title, s.project_id, s.environment_id, a.ee_composer_version, localhost_http_status, 
      store_url_uncached, cat_url_uncached, utilization_start, utilization_end 
    FROM smoke_tests s
    LEFT JOIN applications a on a.project_id = s.project_id 
      AND a.environment_id = s.environment_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE s.localhost_http_status = '302'
      AND ee_composer_version IS NOT null
      AND store_url_uncached > 1 
      AND cat_url_uncached > 1`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
