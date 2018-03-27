const {db} = require('../util/common')

module.exports = (req, res) => {
  const rows = db
    .prepare(
      `SELECT
        e.*, p.region, p.title project_title,
        CASE 
          WHEN e.active=1 AND failure=1 THEN 'active, failure'
          WHEN missing=1 THEN 'missing' 
          WHEN failure=1 THEN 'failure' 
          WHEN e.active=0 THEN 'inactive' 
          ELSE 'active' END 
        AS status
    FROM 
        environments e LEFT JOIN projects p ON e.project_id = p.id
    ORDER BY e.last_created_at DESC`
    )
    .all()
  res.json(rows)
}
