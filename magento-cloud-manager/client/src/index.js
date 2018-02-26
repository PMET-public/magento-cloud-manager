import React from 'react'
import ReactDOM from 'react-dom'
import {BrowserRouter} from 'react-router-dom'
import ResponsiveDrawer from './ResponsiveDrawer'
import registerServiceWorker from './registerServiceWorker'
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles'
import './index.css'


const theme = createMuiTheme({
  palette: {
    secondary: {
      light: '#6d6d6d',
      main: '#424242',
      dark: '#1b1b1b',
      contrastText: '#fff',
    },
    primary: {
      light: '#ff9e40',
      main: '#ff6d00',
      dark: '#c43c00',
      contrastText: '#fff',
    },
  },
});


ReactDOM.render(
  <MuiThemeProvider theme={theme}>
    <BrowserRouter>
      <ResponsiveDrawer />
    </BrowserRouter>
  </MuiThemeProvider>,
  document.getElementById('root')
)
registerServiceWorker()
