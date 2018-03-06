import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import UniqueOptions from '../util/UniqueOptions'
import Icon from 'material-ui/Icon'

export default class extends Component {
  constructor(props) {
    super(props)
    this.state = {}
  }

  matchRow = (filter, row) => {
    return String(row[filter.id]).indexOf(filter.value) !== -1
  }

  render() {
    return (
      <ReactTable
        data={this.state.data}
        onFetchData={(state, instance) => {
          this.setState({loading: true})
          fetch('/api/applications-states')
            .then(res => res.json())
            .then(res => {
              this.setState({
                data: res,
                loading: false
              })
            })
        }}
        minRows={0}
        filterable
        defaultFilterMethod={this.matchRow}
        className={'-striped -highlight'}
        columns={[
          {
            Header: 'Project Id',
            accessor: 'project_id'
          },
          {
            Header: 'Project Title',
            accessor: 'project_title'
          },
          {
            Header: 'Env ID',
            accessor: 'environment_id'
          },
          {
            Header: 'Composer Version',
            accessor: 'ee_composer_version',
            Filter: ({filter, onChange}) => (
              <select
                onChange={event => onChange(event.target.value)}
                style={{width: '100%'}}
                value={filter ? filter.value : 'all'}
              >
                <option value="">Show All</option>
                <UniqueOptions data={this.state.data} accessor={'ee_composer_version'} />
              </select>
            )
          },
          {
            Header: 'Date',
            accessor: 'composer_lock_mtime'
          }
        ]}
      />
    )
  }
}
