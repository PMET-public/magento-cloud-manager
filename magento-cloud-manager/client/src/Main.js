import React, {Component} from 'react'
import {Route} from 'react-router-dom'
import {withStyles} from 'material-ui/styles'
import styles from './style/mui-styles'
import Typography from 'material-ui/Typography'
import EnvironmentsTable from './reports/EnvironmentsTable'
import SmokeTestTable from './reports/SmokeTestTable'
import HostsTable from './reports/HostsTable'
import HostsChart from './reports/HostsChart'

class Main extends Component {
  render() {
    const {classes, theme} = this.props

    return (
      <main className={classes.content}>
        <div className={classes.toolbar} />
        {/* vspace for content*/}
        <Typography noWrap>{'FPO'}</Typography>
        <Route path={'/hosts-table'} component={HostsTable} />
        <Route path={'/hosts-chart'} component={HostsChart} />
        <Route path={'/environments-table'} component={EnvironmentsTable} />
        <Route path={'/smoke-test-table'} component={SmokeTestTable} />
      </main>
    )
  }
}

export default withStyles(styles, {withTheme: true})(Main)
