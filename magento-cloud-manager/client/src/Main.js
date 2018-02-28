import React, {Component} from 'react'
import {Route} from 'react-router-dom'
import {withStyles} from 'material-ui/styles'
import styles from './style/mui-styles'
import Typography from 'material-ui/Typography'
import HostUtilization from './reports/HostUtilization'
import Environments from './reports/Environments'
import Applications from './reports/Applications'

class Main extends Component {
  render() {
    const {classes, theme} = this.props

    return (
      <main className={classes.content}>
        <div className={classes.toolbar} />
        {/* vspace for content*/}
        <Typography noWrap>{'FPO'}</Typography>
        <Route path={'/environments'} component={Environments} />
        <Route path={'/applications'} component={Applications} />
        <Route path={'/hosts'} component={HostUtilization} />
      </main>
    )
  }
}

export default withStyles(styles, {withTheme: true})(Main)
