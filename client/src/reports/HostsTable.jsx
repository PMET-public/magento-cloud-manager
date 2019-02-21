import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import {calcWidth, moment} from '../util/common'
import UniqueOptions from '../util/UniqueOptions'
import Dialog from '../util/Dialog'

export default class extends Component { // eslint-disable-line react/display-name
  constructor(props) {
    super(props)
    this.state = {
      data: []
    }
  }

  matchRow = (filter, row) => {
    return String(row[filter.id]).indexOf(filter.value) !== -1
  }

  countCSV = ({data, column}) => {
    let sum = 0
    data.forEach(v => {
      if (v[column.id] !== null) {
        sum += v[column.id].split(',').length
      }
    })
    if (sum) {
      return <span>{sum}</span>
    }
  }

  render() {
    return (
      <ReactTable
        data={this.state.data}
        onFetchData={(state, instance) => {
          this.setState({loading: true})
          fetch('/hosts-states-current', {credentials: 'same-origin'})
            .then(res => res.json())
            .then(res => {
              this.setState({
                data: res,
                loading: false
              })
            })
        }}
        minRows={0}
        defaultPageSize={20}
        filterable
        defaultFilterMethod={this.matchRow}
        className={'-striped -highlight hosts-current-table'}
        columns={[
          {
            Header: 'Host',
            accessor: 'host_id',
            filterable: false,
            maxWidth: calcWidth(5),
            className: 'right',
            Cell: cell => cell.value
          },
          // if masters and children are ever segregated again, this may be useful
          // {
          //   Header: 'Masters?',
          //   accessor: 'host_id',
          //   filterMethod: (filter, row) => {
          //     return filter.value === 'all' ? true : filter.value === row[filter.id]
          //   },
          //   Filter: ({filter, onChange}) => (
          //     <select
          //       onChange={event => onChange(event.target.value)}
          //       style={{width: '100%'}}
          //       value={filter ? filter.value : 'all'}>
          //       <option value="">Show All</option>
          //       <UniqueOptions data={this.state.data} accessor={'region'} />
          //     </select>
          //   ),
          //   maxWidth: calcWidth(5),
          //   className: 'right',
          //   Cell: cell => cell.value
          // },
          {
            Header: 'Cotenants',
            accessor: 'cotenants',
            Cell: cell => {
              const list = cell.value.split(/,/)
              return (
                <div>
                  <Dialog title="Cotenants" label={list.length ? ''+list.length : ''}>{list}</Dialog>
                </div>
              )
            },
            maxWidth: calcWidth(10),
            className: 'right',
            Footer: this.countCSV
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
                value={filter ? filter.value : 'all'}>
                <option value="">Show All</option>
                <UniqueOptions data={this.state.data} accessor={'region'} />
              </select>
            ),
            maxWidth: calcWidth(6),
            className: 'right'
          },
          {
            Header: 'CPUs',
            accessor: 'cpus',
            filterable: false,
            maxWidth: calcWidth(5),
            className: 'right'
          },
          {
            Header: '% Utilization',
            accessor: 'utilization',
            filterable: false,
            className: 'right',
            /* maxWidth: calcWidth(10), */
            Cell: cell => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#dadada',
                  borderRadius: '2px'
                }}>
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
          },
          {
            Header: 'Last check',
            accessor: 'timestamp',
            filterable: false,
            maxWidth: calcWidth(8),
            className: 'right',
            Cell: cell => moment(new Date(cell.value * 1000)).fromNow()
          }
        ]}
      />
    )
  }
}
