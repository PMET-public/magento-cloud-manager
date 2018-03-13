/* eslint-disable react/no-multi-comp */

import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Dialog, { DialogTitle } from 'material-ui/Dialog';
import Typography from 'material-ui/Typography';
//import blue from 'material-ui/colors/blue';
import styles from '../style/mui-styles'
import Icon from 'material-ui/Icon'


const emails = ['username@gmail.com', 'user02@gmail.com'];
// const styles = {
//   avatar: {
//     backgroundColor: blue[100],
//     color: blue[600],
//   },
// };

class SimpleDialog extends React.Component {
  handleClose = () => {
    this.props.onClose(this.props.selectedValue);
  };

  // handleListItemClick = value => {
  //   this.props.onClose(value);
  // };

  render() {
    const { classes, onClose, selectedValue, ...other } = this.props;
    const errors = this.props.children ? this.props.children.trim().split(/\(\(\d+\s*\)\)/).slice(1).sort() : []
    return (
      <Dialog onClose={this.handleClose} aria-labelledby="simple-dialog-title" {...other}>
        <DialogTitle id="simple-dialog-title">Environment Errors</DialogTitle>
          <List>
            {errors.map(log => (
              <ListItem>
                <ListItemText primary={log} />
              </ListItem>
            ))}
          </List>
      </Dialog>
    );
  }
}

SimpleDialog.propTypes = {
  classes: PropTypes.object.isRequired,
  onClose: PropTypes.func,
  selectedValue: PropTypes.string,
};

const SimpleDialogWrapped = withStyles(styles)(SimpleDialog);

class SimpleDialogDemo extends React.Component {

  // constructor(props) {
  //   super(props)
  //   this.state = {
  //     open: false,
  //     selectedValue: emails[1],
  //   };
  // }

  
  state = {
    open: false,
    selectedValue: emails[1],
  };

  handleClickOpen = () => {
    this.setState({
      open: true,
    });
  };

  handleClose = value => {
    this.setState({ selectedValue: value, open: false });
  };

  render() {
    return (
      <div>
        <Button onClick={this.handleClickOpen}><Icon color="secondary">format_align_left</Icon></Button>
        <SimpleDialogWrapped
          selectedValue={this.state.selectedValue}
          open={this.state.open}
          onClose={this.handleClose}
        >{this.props.children}</SimpleDialogWrapped>
      </div>
    );
  }
}

export default SimpleDialogDemo;