import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import UniqueOptions from './UniqueOptions'
import Icon from 'material-ui/Icon'

class Environments extends Component {
  constructor() {
    super()
    this.state = {}
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
            Header: 'Date',
            accessor: 'created_ad'
          },
          {
            Header: 'Project Title (id)',
            accessor: 'project_id'
          },
          {
            Header: 'Env Title (id)',
            accessor: 'title'
          },
          {
            Header: 'Active',
            accessor: 'active'
          },
          {
            Header: 'Failure',
            accessor: 'failure'
          },
          {
            Header: 'Missing',
            accessor: 'missing',
            Cell: row => <Icon>visibility_off</Icon>
          }
        ]}
      />
    )
  }
}

export default Environments
