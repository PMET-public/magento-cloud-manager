import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import Icon from 'material-ui/Icon'
import projEnvCell from '../util/projEnvCell'
import {calcWidth, moment} from '../util/common'
import UniqueOptions from '../util/UniqueOptions'
import Dialog from '../util/Dialog'
import Gauge from '../util/Gauge'
import Tooltip from 'material-ui/Tooltip'
import {stat} from 'fs'
import checkboxHOC from 'react-table/lib/hoc/selectTable'

const CheckboxTable = checkboxHOC(ReactTable)

moment.updateLocale('en', {
  relativeTime: {
    future: '%s',
    past: '%s',
    s: 'a few sec',
    ss: '%d sec',
    m: 'a min',
    mm: '%d min',
    h: '1 hr',
    hh: '%d hr',
    d: '1 dy',
    dd: '%d dy',
    M: '1 mo',
    MM: '%d mo',
    y: '1 yr',
    yy: '%d yr'
  }
})

export default class extends Component {
  constructor(props) {
    super(props)
    this.state = {
      width: 0,
      height: 0,
      selection: [],
      selectAll: false
    }
    this.updateWindowDimensions = this.updateWindowDimensions.bind(this)
  }

  componentDidMount() {
    this.updateWindowDimensions()
    window.addEventListener('resize', this.updateWindowDimensions)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.updateWindowDimensions)
  }

  updateWindowDimensions = () => {
    this.setState({width: window.innerWidth, height: window.innerHeight})
  }

  matchRow = (filter, row) => {
    return String(row[filter.id]).indexOf(filter.value) !== -1
  }

  exactMatchRow = (filter, row) => {
    return String(row[filter.id]) === filter.value
  }

  formatDate = secSinceEpoch => {
    return /^\d+$/.test(secSinceEpoch)
      ? moment(new Date(secSinceEpoch * 1000).toISOString().slice(0, 10)).fromNow()
      : ''
  }

  formatSecs = secs => {
    return /^[\d.]+$/.test(secs) ? secs.toFixed(1) : ''
  }

  validate = (value, validator, successCb, failureCb) => {
    if (validator(value)) {
      return typeof successCb === 'function' ? successCb(value) : value
    } else {
      return typeof failureCb === 'function' ? failureCb(value) : value
    }
  }

  httpTestFilter = ({filter, onChange}) => (
    <select
      onChange={event => onChange(event.target.value)}
      style={{width: '100%'}}
      value={filter ? filter.value : 'all'}>
      <option value="all">Show All</option>
      <optgroup>
        <option key={'success'} value="1">
          success
        </option>
        <option key={'failed'} value="0">
          404
        </option>
        <option key={'untested'} value="">
          untested
        </option>
      </optgroup>
    </select>
  )

  empty = () => {}
  checkIcon = () => <Icon>check</Icon>
  errorIcon = () => <Icon>error_outline</Icon>
  timerIcon = () => <Icon>timer</Icon>

  toggleSelection = (key, shift, row) => {
    let selection = [...this.state.selection]
    const keyIndex = selection.indexOf(key)
    if (keyIndex >= 0) {
      selection = [...selection.slice(0, keyIndex), ...selection.slice(keyIndex + 1)]
    } else {
      selection.push(key)
    }
    this.setState({selection})
  }

  toggleAll = () => {
    const selectAll = this.state.selectAll ? false : true
    const selection = []
    if (selectAll) {
      const wrappedInstance = this.checkboxTable.getWrappedInstance()
      const currentRecords = wrappedInstance.getResolvedState().sortedData
      currentRecords.forEach(item => {
        selection.push(item._original._id)
      })
    }
    this.setState({selectAll, selection})
  }

  isSelected = key => {
    return this.state.selection.includes(key)
  }

  selectInputComponent = props => {
    return (
      <div>
        <input
          id={props.id ? props.id : 'all'}
          type={props.selectType || 'checkbox'}
          checked={props.checked}
          onClick={e => {
            const {shiftKey} = e
            e.stopPropagation()
            props.onClick(props.id, shiftKey, props.row)
          }}
          onChange={() => {}}
        />
        <label for={props.id ? props.id : 'all'} />
      </div>
    )
  }

  render() {
    return (
      <CheckboxTable
        selectType="checkbox"
        ref={r => (this.checkboxTable = r)}
        selectAll={this.selectAll}
        isSelected={this.isSelected}
        toggleAll={this.toggleAll}
        toggleSelection={this.toggleSelection}
        SelectInputComponent={this.selectInputComponent}
        SelectAllInputComponent={this.selectInputComponent}
        data={this.state.data}
        onFetchData={(state, instance) => {
          this.setState({loading: true})
          fetch('/smoke-tests')
            .then(res => res.json())
            .then(res => {
              this.setState({
                data: res.map(row => {
                  row._id = row.id
                  return row
                }),
                loading: false
              })
            })
        }}
        minRows={0}
        filterable
        defaultPageSize={25}
        defaultFilterMethod={this.matchRow}
        className={'-striped -highlight rotated-headers'}
        style={{
          height: this.state.height - 200 + 'px'
        }}
        getTrProps={(state, rowInfo, column, instance) => {
          return {
            className: this.isSelected(rowInfo.row.id) ? '-selected' : undefined
          }
        }}
        columns={[
          {
            Header: 'Project Env Info',
            columns: [
              projEnvCell,
              {
                Header: 'Region',
                accessor: 'region',
                className: 'right',
                width: calcWidth(5),
                Filter: ({filter, onChange}) => (
                  <select
                    onChange={event => onChange(event.target.value)}
                    style={{width: '100%'}}
                    value={filter ? filter.value : 'all'}>
                    <option value="">Show All</option>
                    <UniqueOptions data={this.state.data} accessor={'region'} />
                  </select>
                ),
                filterMethod: this.exactMatchRow
              }
            ]
          },
          {
            Header: 'Version',
            columns: [
              {
                Header: 'EE Version',
                accessor: 'ee_composer_version',
                className: 'right',
                width: calcWidth(10),
                Filter: ({filter, onChange}) => (
                  <select
                    onChange={event => onChange(event.target.value)}
                    style={{width: '100%'}}
                    value={filter ? filter.value : 'all'}>
                    <option value="">Show All</option>
                    <UniqueOptions data={this.state.data} accessor={'ee_composer_version'} />
                  </select>
                )
              },
              {
                Header: 'app.yaml MD5',
                accessor: 'app_yaml_md5',
                Cell: cell => cell.value.slice(0, 3),
                maxWidth: calcWidth(4),
                filterable: false
              },
              {
                Header: 'composer.lock MD5',
                accessor: 'composer_lock_md5',
                Cell: cell => cell.value.slice(0, 3),
                maxWidth: calcWidth(4),
                filterable: false
              },
              {
                Header: 'composer.lock Age',
                accessor: 'composer_lock_mtime',
                Cell: cell => this.formatDate(cell.value),
                maxWidth: calcWidth(5),
                className: 'right',
                filterable: false
              }
            ]
          },
          {
            Header: 'Performance',
            columns: [
              {
                Header: 'Cumulative CPU',
                accessor: 'cumulative_cpu_percent',
                Cell: cell => cell.value.toFixed(0),
                maxWidth: calcWidth(3),
                className: 'right',
                Filter: '%'
              },
              {
                Header: 'Storefront (uncached)',
                accessor: 'store_url_uncached',
                Cell: cell => this.formatSecs(cell.value),
                maxWidth: calcWidth(4.5),
                className: 'right',
                Filter: this.timerIcon
              },
              {
                Header: 'Storefront (cached)',
                accessor: 'store_url_cached',
                Cell: cell => this.formatSecs(cell.value),
                maxWidth: calcWidth(4.5),
                className: 'right',
                Filter: this.timerIcon
              },
              {
                Header: 'Cat Page (uncached)',
                accessor: 'cat_url_uncached',
                Cell: cell => this.formatSecs(cell.value),
                maxWidth: calcWidth(4.5),
                className: 'right',
                Filter: this.timerIcon
              },
              {
                Header: 'Cat Page (partial cache)',
                accessor: 'cat_url_partial_cache',
                Cell: cell => this.formatSecs(cell.value),
                maxWidth: calcWidth(4.5),
                className: 'right',
                Filter: this.timerIcon
              },
              {
                Header: 'Cat Page (cached)',
                accessor: 'cat_url_cached',
                Cell: cell => this.formatSecs(cell.value),
                maxWidth: calcWidth(4.5),
                className: 'right',
                Filter: this.timerIcon
              },
              {
                Header: 'Cat Page Products',
                accessor: 'cat_url_product_count',
                Cell: cell => (
                  <Tooltip placement="right" title={cell.value} enterDelay={20} leaveDelay={20}>
                    {this.validate(cell.value, v => v > 0, this.checkIcon, this.errorIcon)}
                  </Tooltip>
                ),
                maxWidth: calcWidth(2),
                className: 'right',
                filterable: false
              },
              {
                Header: 'Cat Page',
                accessor: 'cat_url',
                Cell: cell => (cell.value || '').replace(/.*\//, ''),
                maxWidth: 200,
                Filter: ({filter, onChange}) => (
                  <select
                    onChange={event => onChange(event.target.value)}
                    style={{width: '100%'}}
                    value={filter ? filter.value : 'all'}>
                    <option value="">Show All</option>
                    <UniqueOptions data={this.state.data} accessor={'cat_url'} />
                  </select>
                )
              }
            ]
          },
          {
            Header: 'Database Checks',
            columns: [
              {
                Header: 'HTTP Status',
                accessor: 'http_status',
                Cell: cell => this.validate(cell.value, v => v === 302, this.checkIcon, this.errorIcon),
                maxWidth: calcWidth(3),
                className: 'right',
                Filter: ({filter, onChange}) => (
                  <select
                    onChange={event => onChange(event.target.value)}
                    style={{width: '100%'}}
                    value={filter ? filter.value : 'all'}>
                    <option value="">Show All</option>
                    <UniqueOptions data={this.state.data} accessor={'http_status'} />
                  </select>
                )
              },
              {
                Header: 'Not valid indexes',
                accessor: 'not_valid_index_count',
                Cell: cell => this.validate(cell.value, v => v === 0, this.checkIcon, this.errorIcon),
                maxWidth: calcWidth(2),
                className: 'right'
              },
              {
                Header: 'Products',
                accessor: 'catalog_product_entity_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(4),
                className: 'right'
              },
              {
                Header: 'Category Assignments',
                accessor: 'catalog_category_product_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(5),
                className: 'right'
              },
              {
                Header: 'Admins',
                accessor: 'admin_user_count',
                Cell: cell => this.validate(cell.value, v => v > 0, this.checkIcon, this.errorIcon),
                maxWidth: calcWidth(2),
                className: 'right'
              },
              {
                Header: 'Stores',
                accessor: 'store_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(2),
                className: 'right',
                Filter: ({filter, onChange}) => (
                  <select
                    onChange={event => onChange(event.target.value)}
                    style={{width: '100%'}}
                    value={filter ? filter.value : 'all'}>
                    <option value="">Show All</option>
                    <UniqueOptions data={this.state.data} accessor={'store_count'} />
                  </select>
                )
              },
              {
                Header: 'Orders',
                accessor: 'order_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(4),
                className: 'right'
              },
              {
                Header: 'CMS Blocks',
                accessor: 'cms_block_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(3),
                className: 'right'
              },
              {
                Header: 'Templates',
                accessor: 'template_count',
                Cell: cell => <div>{cell.value}</div>,
                maxWidth: calcWidth(2),
                className: 'right'
              },
              {
                Header: 'German',
                accessor: 'german_check',
                Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.empty),
                maxWidth: calcWidth(1),
                Filter: this.httpTestFilter
              },
              {
                Header: 'Venia',
                accessor: 'venia_check',
                Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.empty),
                maxWidth: calcWidth(1),
                Filter: this.httpTestFilter
              },
              {
                Header: 'Admin',
                accessor: 'admin_check',
                Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.errorIcon),
                maxWidth: calcWidth(1),
                Filter: this.httpTestFilter
              },
              {
                Header: 'Errors',
                accessor: 'error_logs',
                Cell: cell => {
                  const list = cell.value ? cell.value.trim().split(/\(\(\d+\s*\)\)/) : []
                  return list.length ? <Dialog title="Environmental Errors">{list}</Dialog> : ''
                },
                maxWidth: calcWidth(5),
                filterMethod: (filter, row, column) => {
                  return new RegExp(filter.value, 'i').test(row[filter.id])
                },
                sortMethod: (a, b) => {
                  const aLength = a ? a.trim().split(/\(\(\d+\s*\)\)/).length : 0
                  const bLength = b ? b.trim().split(/\(\(\d+\s*\)\)/).length : 0
                  return bLength - aLength
                }
              }
            ]
          },
          {
            Header: 'Usage',
            columns: [
              {
                Header: 'Last Customer Login',
                accessor: 'last_login_customer',
                Cell: cell => this.formatDate(cell.value),
                maxWidth: calcWidth(5),
                className: 'right'
              },
              {
                Header: 'Last Admin Login',
                accessor: 'last_login_admin',
                Cell: cell => this.formatDate(cell.value),
                maxWidth: calcWidth(5),
                className: 'right'
              },
              {
                Header: 'Cert Expiration',
                accessor: 'expiration',
                Cell: cell => {
                  if (!cell.value) {
                    return 'N/A'
                  }
                  const expiryDate = new Date(cell.value * 1000)
                  if (expiryDate < new Date()) {
                    return 'Expired!'
                  }
                  return moment(expiryDate).fromNow()
                },
                maxWidth: calcWidth(5),
                className: 'right'
              }
            ]
          },
          {
            Header: 'Test Info',
            columns: [
              {
                Header: '% Load @ test start',
                accessor: 'utilization_start',
                Cell: cell => <Gauge data={cell.value} />,
                maxWidth: calcWidth(7)
              },
              {
                Header: '% Load @ test end',
                accessor: 'utilization_end',
                Cell: cell => <Gauge data={cell.value} />,
                maxWidth: calcWidth(7)
              },
              {
                Header: 'When',
                accessor: 'timestamp',
                Cell: cell => moment(new Date(cell.value * 1000)).fromNow(),
                maxWidth: calcWidth(5),
                className: 'right'
              }
            ]
          }
        ]}
      />
    )
  }
}
