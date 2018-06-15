const express = require('express')
const db = require('./util/common')
const app = express()

app.set('port', process.env.PORT || 3001)

// Express only serves static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'))
}

// map each "/" request to its corresponding src file
const fs = require('fs')
fs.readdir('./src', (err, files) => {
  files.forEach(file => {
    if (/\.js$/.test(file)) {
      const name = file.replace(/\.js$/, '')
      app.get(`/${name}`, require(`./src/${name}`))
    }
  })
})

app.listen(app.get('port'), 'localhost', () => {
  console.log(`Find the server at: http://localhost:${app.get('port')}/`) // eslint-disable-line no-console
})
