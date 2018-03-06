import React, {Component} from 'react'



export default class extends Component {
  constructor() {
    super()
    this.state = {}
  }

  matchRow = (filter, row) => {
    return String(row[filter.id]).indexOf(filter.value) !== -1
  }

  render() {
    return (
      <div>hi</div>
    )
  }
}
