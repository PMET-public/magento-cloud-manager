import React from 'react'
import ReactDOM from 'react-dom'
import {BrowserRouter} from 'react-router-dom'
import ResponsiveDrawer from './ResponsiveDrawer'
import registerServiceWorker from './registerServiceWorker'
import {MuiThemeProvider} from '@material-ui/core/styles'
import theme from './style/mui-theme'
import './style/index.css'

ReactDOM.render(
  <div>
    <MuiThemeProvider theme={theme}>
      <BrowserRouter>
        <ResponsiveDrawer />
      </BrowserRouter>
    </MuiThemeProvider>
  </div>,
  document.getElementById('root')
)
registerServiceWorker()
