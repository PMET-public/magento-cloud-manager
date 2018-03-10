const express = require('express')
const Database = require('better-sqlite3')
const winston = require('winston')

winston.add(winston.transports.File, {filename: `${__dirname}/../log.json`})
const db = new Database(`${__dirname}/../sql/cloud.db`)
const {prepare} = db
db.prepare = function() {
  winston.info(arguments[0])
  return prepare.apply(this, arguments)
}

const app = express()

app.set('port', process.env.PORT || 3001)

// Express only serves static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'))
}

app.get('/api/projects', (req, res) => {
  const param = req.query.q

  if (!param) {
    res.json({
      error: 'Missing required parameter `q`'
    })
    return
  }

  const rows = db.prepare('SELECT id, title FROM projects WHERE id like ?').all('%' + param + '%')

  res.json(rows)
})

app.get('/api/hosts_states/current', (req, res) => {
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
})

app.get('/api/hosts_states/all', (req, res) => {
  const rows = db
    .prepare(`SELECT project_id, load_avg_15, cpus, timestamp from hosts_states order by project_id limit 100`)
    .all()
  res.json(rows)
})

app.get('/api/environments', (req, res) => {
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
      ORDER BY e.created_at DESC`
    )
    .all()
  res.json(rows)
})

app.get('/api/applications-states', (req, res) => {
  const rows = db
    .prepare(
      `SELECT
            a.*, p.region, p.title project_title
        FROM 
            applications_smoke_tests a LEFT JOIN projects p ON a.project_id = p.id
        ORDER BY composer_lock_mtime ASC`
    )
    .all()
  res.json(rows)
})

app.listen(app.get('port'), () => {
  console.log(`Find the server at: http://localhost:${app.get('port')}/`) // eslint-disable-line no-console
})
