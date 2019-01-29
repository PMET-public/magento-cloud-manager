/* eslint-disable react/no-multi-comp */

import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from '@material-ui/core/styles'
import Button from '@material-ui/core/Button'
import styles from '../style/mui-styles'
import Icon from '@material-ui/core/Icon'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import DialogTitle from '@material-ui/core/DialogTitle'
import Dialog from '@material-ui/core/Dialog'


class SimpleDialog extends React.Component {
  render() {
    const {classes, ...other} = this.props
    return (
      <Dialog onClose={this.handleClose} aria-labelledby="simple-dialog-title" {...other}>
        <DialogTitle id="simple-dialog-title">{this.props.title}</DialogTitle>
        <List>
          {this.props.children.map((log, index) => (
            <ListItem key={index}>
              <ListItemText primary={log} />
            </ListItem>
          ))}
        </List>
      </Dialog>
    )
  }
}

SimpleDialog.propTypes = {
  classes: PropTypes.object,
  children: PropTypes.object,
  title: PropTypes.string
}

const SimpleDialogWrapped = withStyles(styles)(SimpleDialog)

class SimpleDialogDemo extends React.Component {
  state = {
    open: false
  }

  handleClickOpen = () => {
    this.setState({
      open: true
    })
  }

  handleClose = () => {
    this.setState({open: false})
  }

  render() {
    return (
      <div>
        <Button variant="raised" color="primary" onClick={this.handleClickOpen} className="dialog-button">
          {this.props.label} <Icon color="secondary">format_align_left</Icon>
        </Button>
        <SimpleDialogWrapped open={this.state.open} onClose={this.handleClose} title={this.props.title} className={this.props.className}>
          {this.props.children}
        </SimpleDialogWrapped>
      </div>
    )
  }
}

export default SimpleDialogDemo

SimpleDialogDemo.propTypes = {
  className: PropTypes.string,
  children: PropTypes.object,
  label: PropTypes.string,
  title: PropTypes.string,
}
