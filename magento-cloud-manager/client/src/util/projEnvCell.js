import React from 'react'
import Icon from 'material-ui/Icon'
import Clipboard from 'react-clipboard.js'

export default {
  Header: 'Project Env',
  accessor: 'id',
  minWidth: 200,
  maxWidth: 200,
  Cell: cell => (
    <div>
      <a
        className=""
        target="_blank"
        href={`https://${cell.original.region}.magento.cloud/projects/${cell.original.project_id}/environments/${
          cell.original.environment_id
        }`}>
        {cell.original.project_title} {cell.original.environment_title} 
        <br/>({cell.original.project_id})
      </a>
      <br />
      <a
        target="_blank"
        href={`http://localhost:3001/commands?p=${cell.original.project_id}&e=${cell.original.environment_id}`}>
        <Icon color="secondary">cloud_download</Icon>
      </a>
      <a
        target="_blank"
        href={`https://${cell.original.machine_name}-${cell.original.project_id}.${
          cell.original.region
        }.magentosite.cloud/`}>
        <Icon color="secondary">shopping_cart</Icon>
      </a>
      <a
        target="_blank"
        href={`https://${cell.original.machine_name}-${cell.original.project_id}.${
          cell.original.region
        }.magentosite.cloud/admin/`}>
        <Icon color="secondary">dashboard</Icon>
      </a>
      <Clipboard
        data-clipboard-text={`~/.magento-cloud/bin/magento-cloud ssh -p ${cell.original.project_id} -e ${
          cell.original.environment_id
        }`}>
        <Icon color="secondary">code</Icon>
      </Clipboard>
    </div>
  ),
  Filter: ({filter, onChange}) => (
    <input
      placeholder="Regular expression"
      type="text"
      onChange={event => onChange(event.target.value)}
      style={{width: '100%'}}
      value={filter && filter.value ? filter.value : ''}
    />
  ),
  filterMethod: (filter, row, column) => {
    const o = row._original
    return new RegExp(filter.value, 'i').test(
      `${o.project_title} ${o.environment_title} ${o.project_id} ${o.environment_id}`
    )
  }
}
