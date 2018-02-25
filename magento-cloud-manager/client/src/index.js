import React from 'react'
import ReactDOM from 'react-dom'
import {BrowserRouter as Router, Link} from 'react-router-dom'
import App from './App'
import './index.css'
import registerServiceWorker from './registerServiceWorker'
// import './semantic/dist/semantic.min.css'

ReactDOM.render(
  <Router>
    <App />
  </Router>,
  document.getElementById('root')
)
registerServiceWorker()
