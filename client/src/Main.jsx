import React, {Component} from 'react'
import {Route} from 'react-router-dom'
import {withStyles} from 'material-ui/styles'
import styles from './style/mui-styles'
import HostsTable from './reports/HostsTable'
import HostsChart from './reports/HostsChart'
import ResponseTimesChart from './reports/ResponseTimesChart'
import SmokeTestTable from './reports/SmokeTestTable'

class Main extends Component {
  render() {
    const {classes, theme} = this.props

    return (
      <main className={classes.content + " main-content"} >
        {/* <div className={classes.toolbar} /> */}
        <Route path={'/hosts-table'} component={HostsTable} />
        <Route path={'/hosts-chart'} component={HostsChart} />
        <Route path={'/response-times-chart'} component={ResponseTimesChart} />
        <Route path={'/smoke-test-table'} component={SmokeTestTable} />
      </main>
    )
  }
}

export default withStyles(styles, {withTheme: true})(Main)
