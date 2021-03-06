import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {Route} from 'react-router-dom'
import {withStyles} from '@material-ui/core/styles'
import styles from './style/mui-styles'
import HostsTable from './reports/HostsTable'
import HostsChart from './reports/HostsChart'
import ResponseTimesChart from './reports/ResponseTimesChart'
import EnvironmentsTable from './reports/EnvironmentsTable'

class Main extends Component {
  render() {
    const {classes} = this.props

    return (
      <main className={classes.content + ' main-content'} >
        {/* <div className={classes.toolbar} /> */}
        <Route path={'/hosts-table'} component={HostsTable} />
        <Route path={'/hosts-chart'} component={HostsChart} />
        <Route path={'/response-times-chart'} component={ResponseTimesChart} />
        <Route path={'/environments-table'} component={EnvironmentsTable} />
      </main>
    )
  }
}

export default withStyles(styles, {withTheme: true})(Main)

Main.propTypes = {
  classes: PropTypes.object
}