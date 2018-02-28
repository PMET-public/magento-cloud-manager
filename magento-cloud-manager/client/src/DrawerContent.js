import React, {Component} from 'react'
import {withStyles} from 'material-ui/styles'
import { ListItemIcon, ListItemText } from 'material-ui/List';
import styles from './style/mui-styles'
import Typography from 'material-ui/Typography'
import { MenuList, MenuItem } from 'material-ui/Menu';
import Icon from 'material-ui/Icon'
import {Link} from 'react-router-dom'

class DrawerContent extends Component {

  render() {
    const {classes, theme} = this.props

    return       <div>
      <div className={classes.toolbar} />

      <MenuList>
        <Link to={'/'}>
          <MenuItem className={classes.menuItem}>
            <ListItemIcon className={classes.icon}>
              <Icon color="secondary">home</Icon>
            </ListItemIcon>
            <ListItemText classes={{ primary: classes.primary }} inset primary="Home" />
          </MenuItem>
        </Link>
        <Link to={'/environments'}>
          <MenuItem className={classes.menuItem}>
            <ListItemIcon className={classes.icon}>
              <Icon color="secondary">exit_to_app</Icon>
            </ListItemIcon>
            <ListItemText classes={{ primary: classes.primary }} inset primary="Environments" />
          </MenuItem>
        </Link>
        <Link to={'/applications'}>
          <MenuItem className={classes.menuItem}>
            <ListItemIcon className={classes.icon}>
              <Icon color="secondary">list</Icon>
            </ListItemIcon>
            <ListItemText classes={{ primary: classes.primary }} inset primary="Applications" />
          </MenuItem>
        </Link>
        <Link to={'/hosts'}>
          <MenuItem className={classes.menuItem}>
            <ListItemIcon className={classes.icon}>
              <Icon color="secondary">cloud_done</Icon>
            </ListItemIcon>
            <ListItemText classes={{ primary: classes.primary }} inset primary="Hosts" />
          </MenuItem>
        </Link>
      </MenuList>

    </div>
  }

}

export default withStyles(styles, {withTheme: true})(DrawerContent)
