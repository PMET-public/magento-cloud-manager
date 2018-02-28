import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import UniqueOptions from '../util/UniqueOptions'
import Icon from 'material-ui/Icon'

class Environments extends Component {
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
          fetch('/api/environments')
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
            Header: 'Env Title',
            accessor: 'title',
            Cell: cell => (
              <div>
                <Icon color="secondary">shopping_cart</Icon>
                <Icon color="secondary">dashboard</Icon>
                <Icon color="secondary">code</Icon>
                {cell.value}
              </div>
            )
          },
          {
            Header: 'Status',
            accessor: 'status',
            Filter: ({filter, onChange}) => (
              <select
                onChange={event => onChange(event.target.value)}
                style={{width: '100%'}}
                value={filter ? filter.value : 'all'}
              >
                <option value="">Show All</option>
                <UniqueOptions data={this.state.data} accessor={'status'} />
              </select>
            )
          },
          {
            Header: 'Date',
            accessor: 'created_at'
          }
        ]}
      />
    )
  }
}

export default Environments
