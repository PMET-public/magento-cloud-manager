import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'material-ui/styles'
import Drawer from 'material-ui/Drawer'
import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'
import IconButton from 'material-ui/IconButton'
import Hidden from 'material-ui/Hidden'
import Icon from 'material-ui/Icon'
import DrawerContent from './DrawerContent'
import Main from './Main'
import styles from './style/mui-styles'

class ResponsiveDrawer extends Component {
  state = {
    mobileOpen: false
  }

  handleDrawerToggle = () => {
    this.setState({mobileOpen: !this.state.mobileOpen})
  }

  render() {
    const {classes, theme} = this.props

    return (
      <div className={classes.root}>
        <AppBar className={classes.appBar}>
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={this.handleDrawerToggle}
              className={classes.navIconHide}>
              <Icon>menu</Icon>
            </IconButton>
            <Typography variant="title" color="inherit" noWrap>
              Magento Cloud Management
            </Typography>
          </Toolbar>
        </AppBar>
        <Hidden mdUp>
          <Drawer
            variant="temporary"
            anchor={theme.direction === 'rtl' ? 'right' : 'left'}
            open={this.state.mobileOpen}
            onClose={this.handleDrawerToggle}
            classes={{
              paper: classes.drawerPaper
            }}
            ModalProps={{
              keepMounted: true // Better open performance on mobile.
            }}>
            <DrawerContent />
          </Drawer>
        </Hidden>
        <Hidden smDown implementation="css">
          <Drawer
            variant="permanent"
            open
            classes={{
              paper: classes.drawerPaper
            }}>
            <DrawerContent />
          </Drawer>
        </Hidden>
        <Main />
      </div>
    )
  }
}

ResponsiveDrawer.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired
}

export default withStyles(styles, {withTheme: true})(ResponsiveDrawer)
