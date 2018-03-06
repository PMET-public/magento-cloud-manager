import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import UniqueOptions from '../util/UniqueOptions'
import Icon from 'material-ui/Icon'
import Clipboard from 'react-clipboard.js'

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
            Header: 'Project Title (id)',
            accessor: 'project_title',
            Cell: cell => (
              <div>
                <a className="" target="_blank" href={`https://${cell.original.region}.magento.cloud/projects/${cell.original.project_id}/environments/${cell.original.id}`}>
                {cell.value} ({cell.original.project_id})
                </a>
              </div>
            ),
            filterMethod: (filter, row, column) => {
              return (String(row[filter.id]).indexOf(filter.value) !== -1 || String(row._original.project_id).indexOf(filter.value) !== -1)
            }
          },
          {
            Header: 'Env Title (id)',
            accessor: 'title',
            Cell: cell => (
              <div>                
                {cell.value} {cell.value === cell.original.id ? '' : `(${cell.original.id})`}
                <span className={"icons-in-td"}>
                  <a target="_blank" href={`https://${cell.original.machine_name}-${cell.original.project_id}.${cell.original.region}.magentosite.cloud/`}>
                    <Icon color="secondary">shopping_cart</Icon>
                  </a>
                  <a  target="_blank" href={`https://${cell.original.machine_name}-${cell.original.project_id}.${cell.original.region}.magentosite.cloud/admin/`}>
                      <Icon color="secondary">dashboard</Icon>
                    </a>
                  <Clipboard data-clipboard-text={`~/.magento-cloud/bin/magento-cloud ssh -p ${cell.original.project_id} -e ${cell.original.id}`}>
                    <Icon color="secondary">code</Icon>
                  </Clipboard>
                </span>
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
            Header: 'Created',
            accessor: 'created_at',
            Cell: cell => (
              <div>
                {new Date(cell.value*1000).toISOString().slice(0, 10)}
              </div>
            ),
            maxWidth: 100
          }
        ]}
      />
    )
  }
}
