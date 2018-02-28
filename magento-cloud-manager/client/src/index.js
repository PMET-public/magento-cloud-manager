import React from 'react'
import ReactDOM from 'react-dom'
import {BrowserRouter} from 'react-router-dom'
import ResponsiveDrawer from './ResponsiveDrawer'
import registerServiceWorker from './registerServiceWorker'
import {MuiThemeProvider} from 'material-ui/styles'
import theme from './style/mui-theme'
import Reboot from 'material-ui/Reboot'
import './style/index.css'

ReactDOM.render(
  <div>
    <Reboot />
    <MuiThemeProvider theme={theme}>
      <BrowserRouter>
        <ResponsiveDrawer />
      </BrowserRouter>
    </MuiThemeProvider>
  </div>,
  document.getElementById('root')
)
registerServiceWorker()
