import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'

class HostUtilization extends Component {
  constructor() {
    super()
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
          fetch('/api/hosts_states/current')
            .then(res => {
              return res.json()
            })
            .then(res => {
              this.setState({
                data: res,
                loading: false
              })
            })
        }}
        filterable
        defaultFilterMethod={this.matchRow}
        className={'-striped -highlight'}
        columns={[
          {
            Header: 'Projects',
            accessor: 'projects'
          },
          {
            Header: 'Region',
            accessor: 'region',
            filterMethod: (filter, row) => {
              if (filter.value === 'all') {
                return true
              }
              if (filter.value === 'true') {
                return row[filter.id] >= 21
              }
              return row[filter.id] < 21
            },
            Filter: ({filter, onChange}) => (
              <select
                onChange={event => onChange(event.target.value)}
                style={{width: '100%'}}
                value={filter ? filter.value : 'all'}
              >
                <option value="all">Show All</option>
                <option value="true">US</option>
                <option value="false">US-3</option>
              </select>
            ),
            maxWidth: 100,
            style: {textAlign: 'right'}
          },
          {
            Header: 'CPUs',
            accessor: 'cpus',
            filterable: false,
            maxWidth: 60,
            style: {textAlign: 'right'}
          },
          {
            Header: 'Load',
            accessor: 'load',
            filterable: false,
            maxWidth: 60,
            style: {textAlign: 'right'}
          },
          {
            Header: '% Utilization',
            accessor: 'utilization',
            filterable: false,
            maxWidth: 60,
            style: {textAlign: 'right'}
          }
        ]}
      />
    )
  }
}

export default HostUtilization
