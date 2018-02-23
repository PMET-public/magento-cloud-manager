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

const COLUMNS = ['id','title']
app.get('/api/projects', (req, res) => {
  const param = req.query.q

  if (!param) {
    res.json({
      error: 'Missing required parameter `q`'
    })
    return
  }

  res.json(db
    .prepare('SELECT id, title FROM projects WHERE id like "%?%"')
    .all(param))


  /* if (r[0]) {
    res.json(
      r[0].values.map(entry => {
        const e = {}
        COLUMNS.forEach((c, idx) => {
          e[c] = entry[idx]
        })
        return e
      })
    )
  } else {
    res.json([])
  } */
})

app.listen(app.get('port'), () => {
  console.log(`Find the server at: http://localhost:${app.get('port')}/`) // eslint-disable-line no-console
})
