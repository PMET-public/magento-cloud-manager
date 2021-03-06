import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {withStyles} from '@material-ui/core/styles'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import styles from './style/mui-styles'
import MenuList from '@material-ui/core/MenuList'
import MenuItem from '@material-ui/core/MenuItem'
import Icon from '@material-ui/core/Icon'
import {Link} from 'react-router-dom'

class DrawerContent extends Component {
  render() {
    const {classes} = this.props

    return (
      <div>
        {/*<div className={classes.toolbar} />*/}

        <MenuList>
          <Link to={'/'}>
            <MenuItem className={classes.menuItem}>
              <ListItemIcon className={classes.icon}>
                <Icon color="secondary">home</Icon>
              </ListItemIcon>
              <ListItemText classes={{primary: classes.primary}} inset primary="Dashboard" />
            </MenuItem>
          </Link>
          <Link to={'/hosts-table'}>
            <MenuItem className={classes.menuItem}>
              <ListItemIcon className={classes.icon}>
                <Icon color="secondary">cloud_done</Icon>
              </ListItemIcon>
              <ListItemText classes={{primary: classes.primary}} inset primary="Hosts (current)" />
            </MenuItem>
          </Link>
          <Link to={'/hosts-chart'}>
            <MenuItem className={classes.menuItem}>
              <ListItemIcon className={classes.icon}>
                <Icon color="secondary">show_chart</Icon>
              </ListItemIcon>
              <ListItemText classes={{primary: classes.primary}} inset primary="Hosts (historic)" />
            </MenuItem>
          </Link>
          <Link to={'/response-times-chart'}>
            <MenuItem className={classes.menuItem}>
              <ListItemIcon className={classes.icon}>
                <Icon color="secondary">show_chart</Icon>
              </ListItemIcon>
              <ListItemText classes={{primary: classes.primary}} inset primary="Response times" />
            </MenuItem>
          </Link>
          <Link to={'/environments-table'}>
            <MenuItem className={classes.menuItem}>
              <ListItemIcon className={classes.icon}>
                <Icon color="secondary">list</Icon>
              </ListItemIcon>
              <ListItemText classes={{primary: classes.primary}} inset primary="Environments" />
            </MenuItem>
          </Link>
        </MenuList>
      </div>
    )
  }
}

export default withStyles(styles, {withTheme: true})(DrawerContent)

DrawerContent.propTypes = {
  classes: PropTypes.object
}
