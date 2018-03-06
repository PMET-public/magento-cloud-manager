import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import UniqueOptions from '../util/UniqueOptions'

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
          fetch('/api/hosts_states/current')
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
            Header: 'Project Names',
            accessor: 'projects',
            Cell: cell => cell.value.replace(/,/g, ', ')
          },
          {
            Header: 'Region',
            accessor: 'region',
            filterMethod: (filter, row) => {
              return filter.value === 'all' ? true : filter.value === row[filter.id]
            },
            Filter: ({filter, onChange}) => (
              <select
                onChange={event => onChange(event.target.value)}
                style={{width: '100%'}}
                value={filter ? filter.value : 'all'}
              >
                <option value="">Show All</option>
                <UniqueOptions data={this.state.data} accessor={'region'} />
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
            style: {textAlign: 'right'},
            Cell: cell => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#dadada',
                  borderRadius: '2px'
                }}
              >
                <span style={{float: 'right', marginRight: '3px'}}>{cell.value}</span>
                <div
                  className={
                    cell.value > 100
                      ? 'cell-status-warning'
                      : cell.value > 80 ? 'cell-status-caution' : 'cell-status-normal'
                  }
                  style={{
                    width: `${cell.value}%`,
                    maxWidth: '100%',
                    height: '100%',
                    borderRadius: '2px'
                  }}
                />
              </div>
            )
          }
        ]}
      />
    )
  }
}
