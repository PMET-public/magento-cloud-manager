import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import Icon from '@material-ui/core/Icon'
import {calcWidth, moment} from '../util/common'
import Dialog from '../util/Dialog'
import Tooltip from '@material-ui/core/Tooltip'
import checkboxHOC from 'react-table/lib/hoc/selectTable'
import Clipboard from 'react-clipboard.js'

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

const defaultFiltered = [{
  id: 'proj_status',
  value: 'active'
}, {
  id: 'env_status',
  value: 'active'
}]

const curDateInSecs = parseInt(new Date()/1000, 10)
const secsIn1Day = 24 * 60 * 60
const secsIn2Wk = 14 * secsIn1Day
const secsIn1Mo = 30 * secsIn1Day
const secsIn3Mo = 90 * secsIn1Day
const secsIn6Mo = 180 * secsIn1Day
const secsIn1Yr = 365 * secsIn1Day


export default class EnvironmentsTable extends Component {
  constructor(props) {
    super(props)
    this.state = {
      width: 0,
      height: 0,
      selection: [],
      selectAll: false,
      filtered: defaultFiltered
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
    if (filter.value === 'untested') {
      return row[filter.id] === null 
    }
    return String(row[filter.id]).indexOf(filter.value) !== -1
  }

  exactMatchRow = (filter, row) => {
    if (filter.value === 'all') {
      return true
    }
    if (filter.value === 'untested') {
      return row[filter.id] === null
    }
    return String(row[filter.id]) === filter.value
  }

  envStatusFilter = (filter, row) => {
    if (filter.value === 'all') {
      return true
    }
    if (filter.value === 'untested') {
      return row[filter.id] === null
    }
    return String(row[filter.id]) === filter.value
  }

  zeroIsPassing = (filter, row) => {
    const val = parseInt(row[filter.id],10)
    switch (filter.value) {
      case 'passing':
        return val === 0
      case 'failing':
        return val > 0
      case 'untested':
        return row[filter.id] === null
      default:
        return true
    }
  }

  zeroIsFailing = (filter, row) => {
    const val = parseInt(row[filter.id],10)
    switch (filter.value) {
      case 'passing':
        return val > 0
      case 'failing':
        return val === 0
      case 'untested':
        return row[filter.id] === null
      default:
        return true
    }
  }

  cronFilter = (filter, row) => {
    const cronTime = parseInt(row[filter.id],10)
    const testTime = parseInt(row['timestamp'],10)
    switch (filter.value) {
      case 'passing':
        return testTime - cronTime <= 900
      case 'failing':
        return testTime - cronTime > 900
      case 'untested':
        return row[filter.id] === null
      default:
        return true
    }
  }

  average = ({data, column}) => {
    let sum = 0
    let count = 0
    data.forEach(v => {
      if (v[column.id] !== null) {
        sum += v[column.id]
        count++
      }
    })
    if (count) {
      return <span>{Math.round(sum * 10 / count) / 10}</span>
    } else {
      return null
    }
  }

  formatDate = secSinceEpoch => {
    return /^\d+$/.test(secSinceEpoch)
      ? moment(new Date(secSinceEpoch * 1000).toISOString().slice(0, 10)).fromNow().replace(/(.*) /, '$1').replace(/.$/, '')
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

  errorList = list => {
    if (/^1[45]/.test(list[0])) {
      return list.sort().map(li => {
        const [entireLiIgnoreMe, secSinceEpoch, file, msg] = li.match(/(.*?) (.*?) (.*)/)
        return (
          <div key={secSinceEpoch}>
            {new Date(secSinceEpoch * 1000).toISOString()}
            <b>{file}</b>
            {msg}
          </div>
        )
      })
    } else {
      return list
    }
  }

  empty = () => ''
  checkIcon = () => <Icon>check</Icon>
  errorIcon = () => <Icon color="error">error_outline</Icon>
  timerIcon = () => <Icon>timer</Icon>
  starIcon = () => <Icon>star</Icon>

  valueToIcon = (key) => {
    const iconMap = {
      'active': <Icon>check</Icon>,
      'inactive': 'i',
      'failure': 'f',
      'missing': 'm'
    }
    if (!(key in iconMap)) {
      return key
    }
    return iconMap[key]
  }

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

  deployCompleted = text => {
    return /(Deployment|Branch) completed.\s*$/.test(text)
  }

  selectInputComponent = props => {
    return (
      <div>
        <input
          id={props.id ? props.id : 'all'}
          type={props.selectType || 'checkbox'}
          // checked={props.checked}
          checked={this.isSelected(props.id) || props.checked}
          onClick={e => {
            const {shiftKey} = e
            e.stopPropagation()
            props.onClick(props.id, shiftKey, props.row)
          }}
          onChange={() => {}}
        />
        <label htmlFor={props.id ? props.id : 'all'} />
      </div>
    )
  }

  createFilterOptions = filters => {
    const options = []
    for (let i in filters) {
      options.push(<option key={filters[i].key} value={filters[i].value}>{filters[i].label}</option>)
    }
    const filterOptions = ({filter, onChange}) => {
      return (<select
        onChange={event => onChange(event.target.value)}
        style={{width: '100%'}}
        value={filter ? filter.value : 'all'}>
        <option value="">Show All</option>
        <optgroup>
          {options}
        </optgroup>
      </select>)
    }
    return filterOptions
  }

  createFilterOptionsFromAccessor = accessor => {
    if (this.state.data) {
      const accessorVals = [...new Set(this.state.data.map(x => x[accessor]).sort())]
      const filters = []
      for (let i in accessorVals) {
        if (accessorVals[i] === null) {
          filters.push(this.untestedFilter)
        } else if (accessorVals[i] === 'active') {
          filters.push(this.activeFilter)
        } else if (accessorVals[i] === 'missing') {
          filters.push(this.missingFilter)
        } else {
          filters.push({
            key: accessorVals[i],
            label: accessorVals[i],
            value: accessorVals[i]
          })
        }
      }
      return this.createFilterOptions(filters)
    } else {
      return null
    }
  }

  createBranchLevelFilterOptions = () => {
    if (this.state.data) {
      const branchLevelVals = [...new Set(this.state.data.map(x => x['branch_level']).sort())]
      const filters = []
      for (let i in branchLevelVals) {
        if (branchLevelVals[i] === null) {
          filters.push(this.untestedFilter)
        } else {
          filters.push({
            key: branchLevelVals[i],
            label: branchLevelVals[i] === 0 ? 'master' : branchLevelVals[i],
            value: branchLevelVals[i]
          })
        }
      }
      filters.push({
        key: 'nonmaster',
        label: 'nonmaster',
        value: 'nonmaster'
      })
      return this.createFilterOptions(filters)
    } else {
      return null
    }
  }

  createUserFilterOptions = () => {
    if (this.state.data) {
      const users = Array.from(new Set(
        [].concat(...this.state.data.map(x => 
          x['user_list'].toLowerCase().replace(/:.*?(,|$)/g,' ').trim().split(' '))
        ).sort()
      ))
      const filters = []
      for (let i in users) {
        filters.push({
          key: users[i],
          label: users[i],
          value: users[i]
        })
      }
      return this.createFilterOptions(filters)
    } else {
      return null
    }
  }

  createFilterMethod = filters => {
    const filterMethod = (filter, row) => {
      for (let i in filters) {
        if (filters[i].value === filter.value) {
          return filters[i].test(filter, row)
        }
      }
      return true
    }
    return filterMethod
  }

  testedFilter = {
    key: 'tested',
    value: 'tested',
    label: 'tested',
    test: (filter, row) => {
      return row[filter.id] !== null
    }
  }

  untestedFilter = {
    key: 'untested',
    value: 'untested',
    label: 'untested',
    test: (filter, row) => {
      return row[filter.id] === null
    }
  }

  activeFilter = {
    key: 'active',
    value: 'active',
    label: 'active'
  }

  missingFilter = {
    key: 'mising',
    value: 'missing',
    label: 'missing'
  }

  httpTestFilters = [
    {
      key: 'success',
      value: '1',
      label: 'success'
    },
    {
      key: 'failed',
      value: '0',
      label: '404'
    },
    this.untestedFilter
  ]

  passFailFilters = [
    {
      key: 'success',
      value: 'passing',
      label: 'passing'
    },
    {
      key: 'failed',
      value: 'failing',
      label: 'failing'
    },
    this.untestedFilter
  ]

  lessThan2WkAgoFilter = {
    key: '< 2 wk', 
    value: '< ' + secsIn2Wk, 
    label: '< 2 wk',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
      curDateInSecs - secsIn2Wk < new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  lessThan2WkHenceFilter = {
    key: '< 2 wk', 
    value: '< ' + secsIn2Wk, 
    label: '< 2 wk',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
      new Date(row[filter.id] * 1000)/1000 < curDateInSecs + secsIn2Wk
      return retVal
    }
  }

  moreThan2WkHenceFilter = {
    key: '> 2 wk', 
    value: '> ' + secsIn2Wk, 
    label: '> 2 wk',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
        new Date(row[filter.id] * 1000)/1000 > curDateInSecs + secsIn2Wk
      return retVal
    }
  }

  lessThan1MoAgoFilter = {
    key: '< 1 mo', 
    value: '> ' + secsIn1Mo,
    label: '< 1 mo',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null &&
        curDateInSecs - secsIn1Mo < new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  lessThan3MoAgoFilter = {
    key: '< 3 mo', 
    value: '> ' + secsIn3Mo,
    label: '< 3 mo',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
        curDateInSecs - secsIn3Mo < new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  lessThan6MoAgoFilter = {
    key: '< 6 mo', 
    value: '< ' + secsIn6Mo,
    label: '< 6 mo',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
        curDateInSecs - secsIn6Mo < new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  lessThan1YrAgoFilter = {
    key: '< 1 yr', 
    value: '< ' + secsIn1Yr,
    label: '< 1 yr',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
        curDateInSecs - secsIn1Yr < new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  moreThan1YrAgoFilter = {
    key: '> 1 yr', 
    value: '> ' + secsIn1Yr,
    label: '> 1 yr',
    test: (filter, row) => {
      const retVal = row[filter.id] !== null && 
        curDateInSecs - secsIn1Yr > new Date(row[filter.id] * 1000)/1000
      return retVal
    }
  }

  neverFilter = {
    key: 'never',
    value: 'never',
    label: 'never',
    test: (filter, row) => {
      return row[filter.id] === null
    }
  }

  commonTimeBasedFilters = [
    this.lessThan2WkAgoFilter,
    this.lessThan1MoAgoFilter,
    this.lessThan3MoAgoFilter,
    this.lessThan6MoAgoFilter,
    this.lessThan1YrAgoFilter,
    this.moreThan1YrAgoFilter,
  ]

  commonTBFWithNever = this.commonTimeBasedFilters.concat([this.neverFilter])

  expirationFilters = [
    {
      key: 'expired', 
      value: curDateInSecs.toString(), 
      label: 'expired',
      test: (filter, row) => {
        const retVal = row[filter.id] !== null && 
          row[filter.id] < curDateInSecs
        return retVal
      }
    },
    this.lessThan2WkHenceFilter,
    this.moreThan2WkHenceFilter,
    this.untestedFilter
  ]

  deployLogFilters = [
    {
      key: 'complete',
      value: 'complete',
      label: 'complete',
      test: (filter, row) => {
        return row[filter.id] && this.deployCompleted(row[filter.id])
      }
    },
    {
      key: 'incomplete',
      value: 'incomplete',
      label: 'incomplete',
      test: (filter, row) => {
        return row[filter.id] && !this.deployCompleted(row[filter.id])
      }
    },
    this.untestedFilter
  ]

  resetAllFilters = () => {
    this.setState({filtered: defaultFiltered});
  }

  render() {
    return (
      <div>
        <button onClick={this.resetAllFilters}>Reset All Filters</button>
        <Clipboard
          className="checkbox-selection-to-clipboard-button"
          data-clipboard-text={this.state.selection.join(' ').replace(/(^| )select-/g,' ').trim()}>
          Copy selected
        </Clipboard>
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
          filtered={this.state.filtered}
          onFilteredChange={(newFiltered) => {
            this.setState({filtered: newFiltered, selection: []})
          }}
          onFetchData={(state, instance) => {
            this.setState({loading: true})
            fetch('/environments', {credentials: 'same-origin'})
              .then(res => res.json())
              .then(res => {
                this.setState({
                  data: res.map(row => {
                    row._id = row.project_id + ':' + row.environment_id
                    return row
                  })
                  ,
                  loading: false
                })
              })
          }}
          minRows={0}
          filterable
          defaultPageSize={10}
          defaultFilterMethod={this.matchRow}
          className={'-striped -highlight rotated-headers'}
          style={{
            height: this.state.height - 165 + 'px'
          }}
          getTrProps={(state, rowInfo, column, instance) => {
            return {
              className: this.isSelected(rowInfo.row.id) ? '-selected' : undefined
            }
          }}
          getPaginationProps={
            (state, rowInfo, column, instance) => {
              return { style: {width: 'calc(100% - 240px)'}}
            }
          }
          columns={[
            {
              Header: 'Project Env Info',
              columns: [
                {
                  Header: 'Project Env',
                  accessor: 'project_environment_id',
                  minWidth: 200,
                  maxWidth: 200,
                  headerClassName: 'adjacent-to-checkbox-column',
                  Cell: cell => (
                    <div>
                      {/* <a
                        target="_blank" rel="noopener noreferrer"
                        href={`http://localhost:3001/commands?p=${cell.original.project_id}&e=${
                          cell.original.environment_id
                        }`}>
                        <Icon color="secondary">cloud_download</Icon>
                      </a> */}
                      <a
                        target="_blank" rel="noopener noreferrer"
                        href={`https:///admin:${cell.original.project_id}@${cell.original.machine_name}-${cell.original.project_id}.${
                          cell.original.region
                        }.magentosite.cloud/`}>
                        <Icon color="secondary">shopping_cart</Icon>
                      </a>
                      <a
                        target="_blank" rel="noopener noreferrer"
                        href={`https://admin:${cell.original.project_id}@${cell.original.machine_name}-${cell.original.project_id}.${
                          cell.original.region
                        }.magentosite.cloud/admin/`}>
                        <Icon color="secondary">dashboard</Icon>
                      </a>
                      <Clipboard
                        data-clipboard-text={`~/.magento-cloud/bin/magento-cloud ssh -p ${cell.original.project_id} -e ${
                          cell.original.environment_id
                        }`}>
                        <Icon color="secondary">code</Icon>
                      </Clipboard> &nbsp;
                      <a
                        className=""
                        target="_blank" rel="noopener noreferrer"
                        href={`https://${cell.original.region}.magento.cloud/projects/${
                          cell.original.project_id
                        }/environments/${cell.original.environment_id}`}>
                        {cell.original.project_title}<br/>
                        {cell.original.environment_title} &nbsp;
                        {cell.original.project_id}
                      </a>
                    </div>
                  ),
                  // Filter: ({filter, onChange}) => (
                  //   <div>
                  //     {/* <Clipboard
                  //       className="checkbox-selection-to-clipboard-button"
                  //       data-clipboard-text={this.state.selection.join(' ')}>
                  //       <Icon color="secondary">code</Icon>
                  //     </Clipboard> */}
                  //     <input
                  //       placeholder="Regex"
                  //       type="text"
                  //       onChange={event => onChange(event.target.value)}
                  //       style={{width: '90%'}}
                  //       value={filter && filter.value ? filter.value : ''}
                  //     />
                  //   </div>
                  // ),
                  filterMethod: (filter, row, column) => {
                    const o = row._original
                    return new RegExp(filter.value, 'i').test(
                      `${o.project_title} ${o.environment_title} ${o.project_id} ${o.environment_id}`
                    )
                  }
                },
                {
                  Header: 'Branch Level',
                  accessor: 'branch_level',
                  className: 'right',
                  width: calcWidth(2),
                  Cell: cell => this.validate(cell.value, v => v === 0, this.starIcon, cell.value),
                  Filter: this.createBranchLevelFilterOptions(),
                  filterMethod: (filter, row, column) => {
                    if (filter.value === 'all') {
                      return true
                    } else if (filter.value === 'untested') {
                      return row[filter.id] === null
                    } else if (filter.value === 'nonmaster') {
                      return row[filter.id] !== 0
                    } else {
                      return String(row[filter.id]) === filter.value
                    }
                  }
                },
                {
                  Header: 'Region',
                  accessor: 'region',
                  className: 'region-col',
                  width: calcWidth(4),
                  Filter: this.createFilterOptionsFromAccessor('region'),
                  filterMethod: this.exactMatchRow
                },
                {
                  Header: 'Proj Status',
                  accessor: 'proj_status',
                  className: 'right',
                  width: calcWidth(3),
                  Filter: this.createFilterOptionsFromAccessor('proj_status'),
                  filterMethod: this.exactMatchRow,
                  Cell: cell => this.validate(cell.value, v => v === 'active', this.checkIcon, this.errorIcon),
                },
                {
                  Header: 'Env Status',
                  accessor: 'env_status',
                  className: 'right',
                  width: calcWidth(3),
                  Filter: this.createFilterOptionsFromAccessor('env_status'),
                  // filterMethod: this.envStatusFilter,
                  filterMethod: this.exactMatchRow,
                  Cell: cell => this.valueToIcon(cell.value)
                },
                {
                  Header: 'Users\' Emails',
                  accessor: 'user_list',
                  maxWidth: calcWidth(4),
                  className: 'right',
                  Cell: cell => {
                    const list = cell.value
                      ? cell.value
                          .trim()
                          .split(/,/)
                          .map(x => x.replace(/:(.*)/, ' ($1)'))
                      : []
                    return list.length ? <Dialog title="Users (roles)" label={list.length ? ''+list.length : ''}>{list}</Dialog> : ''
                  },
                  Filter: this.createUserFilterOptions(),
                  filterMethod: (filter, row, column) => {
                    return new RegExp(filter.value, 'i').test(row[filter.id])
                  },
                  sortMethod: (a, b) => {
                    const aLength = a ? a.trim().split(/,/).length : 0
                    const bLength = b ? b.trim().split(/,/).length : 0
                    return bLength - aLength
                  }
                }
              ]
            },
            {
              Header: 'App Version',
              columns: [
                {
                  Header: 'EE Version',
                  accessor: 'ee_composer_version',
                  className: 'version-col',
                  width: calcWidth(4),
                  Filter: this.createFilterOptionsFromAccessor('ee_composer_version')
                },
                // {
                //   Header: 'app.yaml MD5',
                //   accessor: 'app_yaml_md5',
                //   Cell: cell => (cell.value ? cell.value.slice(0, 3) : ''),
                //   maxWidth: calcWidth(3),
                //   Filter: this.createFilterOptionsFromAccessor('app_yaml_md5')
                // },
                {
                  Header: 'env.yaml MD5',
                  accessor: 'env_yaml_md5',
                  Cell: cell => (cell.value ? cell.value.slice(0, 3) : ''),
                  maxWidth: calcWidth(3),
                  Filter: this.createFilterOptionsFromAccessor('env_yaml_md5')
                },
                {
                  Header: 'composer.lock MD5',
                  accessor: 'composer_lock_md5',
                  Cell: cell => (cell.value ? cell.value.slice(0, 3) : ''),
                  maxWidth: calcWidth(3),
                  Filter: this.createFilterOptionsFromAccessor('composer_lock_md5')
                },
                {
                  Header: 'config.php MD5',
                  accessor: 'config_php_md5',
                  Cell: cell => (cell.value ? cell.value.slice(0, 3) : ''),
                  maxWidth: calcWidth(3),
                  Filter: this.createFilterOptionsFromAccessor('config_php_md5')
                }
              ]
            },
            {
              Header: 'App Usage',
              columns: [
                {
                  Header: 'Created',
                  accessor: 'last_created_at',
                  Cell: cell => this.formatDate(cell.value),
                  maxWidth: calcWidth(3),
                  className: 'right',
                  Filter: this.createFilterOptions(this.commonTimeBasedFilters),
                  filterMethod: this.createFilterMethod(this.commonTimeBasedFilters)
                },
                {
                  Header: 'Last Customer Login',
                  accessor: 'last_login_customer',
                  Cell: cell => this.formatDate(cell.value),
                  maxWidth: calcWidth(5),
                  className: 'right',
                  Filter: this.createFilterOptions(this.commonTBFWithNever),
                  filterMethod: this.createFilterMethod(this.commonTBFWithNever)
                },
                {
                  Header: 'Last Admin Login',
                  accessor: 'last_login_admin',
                  Cell: cell => this.formatDate(cell.value),
                  maxWidth: calcWidth(5),
                  className: 'right',
                  Filter: this.createFilterOptions(this.commonTimeBasedFilters),
                  filterMethod: this.createFilterMethod(this.commonTimeBasedFilters)
                }
              ]
            },
            {
              Header: 'App Checks',
              columns: [
                {
                  Header: 'Cert Expires',
                  accessor: 'expiration',
                  Cell: cell => {
                    if (!cell.value) {
                      return cell.value
                    }
                    const expiryDate = new Date(cell.value * 1000)
                    if (expiryDate < new Date()) {
                      return this.errorIcon
                    }
                    return this.formatDate(cell.value)
                  },
                  maxWidth: calcWidth(3),
                  className: 'right',
                  Filter: this.createFilterOptions(this.expirationFilters),
                  filterMethod: this.createFilterMethod(this.expirationFilters)
                },
                {
                  Header: 'Public HTTP Status',
                  accessor: 'public_http_status',
                  // Cell: cell => ({
                  //   200: <Icon>check</Icon>,
                  //   302: 302,
                  //   503: <Icon color="error">error_outline</Icon>
                  // })[cell.value] || null,
                  Cell: cell => this.validate(cell.value, v => v === 200, this.checkIcon, this.errorIcon),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptionsFromAccessor('public_http_status'),
                },
                {
                  Header: 'Localhost HTTP Status',
                  accessor: 'localhost_http_status',
                  Cell: cell => this.validate(cell.value, v => v === 302, this.checkIcon, this.errorIcon),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptionsFromAccessor('localhost_http_status'),
                },
                {
                  Header: 'Cron',
                  accessor: 'last_cron_success',
                  // was cron successfully run in the last 15 min before the smoke test
                  Cell: cell => this.validate(cell, cell => cell.original.timestamp - cell.value < 900, this.checkIcon, this.errorIcon),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptions(this.passFailFilters),
                  filterMethod: this.cronFilter
                },
                {
                  Header: 'All indexes valid',
                  accessor: 'not_valid_index_count',
                  Cell: cell => this.validate(cell.value, v => v === 0, this.checkIcon, this.errorIcon),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptions(this.passFailFilters),
                  filterMethod: this.zeroIsPassing
                },
                {
                  Header: 'German',
                  accessor: 'german_check',
                  Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.empty),
                  maxWidth: calcWidth(1),
                  Filter: this.createFilterOptions(this.httpTestFilters)
                },
                {
                  Header: 'Venia',
                  accessor: 'venia_check',
                  Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.empty),
                  maxWidth: calcWidth(1),
                  Filter: this.createFilterOptions(this.httpTestFilters)
                },
                {
                  Header: 'Admin Login',
                  accessor: 'admin_check',
                  Cell: cell => this.validate(cell.value, v => v === 1, this.checkIcon, this.errorIcon),
                  maxWidth: calcWidth(1),
                  Filter: this.createFilterOptions(this.passFailFilters),
                  filterMethod: this.zeroIsFailing
                },
                {
                  Header: 'Errors',
                  accessor: 'error_logs',
                  className: 'right',
                  Cell: cell => {
                    const list = cell.value
                      ? cell.value
                          .trim()
                          .replace(/ (1[45]\d{8} \/)/g, '\n$1')
                          .split('\n')
                      : []
                    return list.length ? <Dialog title="Environmental Errors" label={list.length ? ''+list.length : ''}>{this.errorList(list)}</Dialog> : ''
                  },
                  maxWidth: calcWidth(5),
                  filterMethod: (filter, row, column) => {
                    return new RegExp(filter.value, 'i').test(row[filter.id])
                  },
                  sortMethod: (a, b) => {
                    const aLength = a ? a.trim().split(/ 1[45]\d{8} \//).length : 0
                    const bLength = b ? b.trim().split(/ 1[45]\d{8} \//).length : 0
                    return bLength - aLength
                  }
                },
                {
                  Header: 'Deploy Log End',
                  accessor: 'last_deploy_log',
                  className: 'right',
                  Cell: cell => {
                    const list = cell.value
                      ? cell.value
                        .trim()
                        .split('\v')
                      : []
                    if (!list.length) {
                      return null
                    } else if (this.deployCompleted(list[list.length-1])) {
                      return this.checkIcon()
                    } else {
                      return <Dialog title="End of Last Deploy Log" className="compact" label='!'>{list}</Dialog>
                    }
                  },
                  maxWidth: calcWidth(5),
                  Filter: this.createFilterOptions(this.deployLogFilters),
                  filterMethod: this.createFilterMethod(this.deployLogFilters)
                }
              ]
            },
            {
              Header: 'Database Checks',
              columns: [
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
                  Cell: cell => this.validate(cell.value, v => v > 0, cell.value, this.errorIcon),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptionsFromAccessor('admin_user_count')
                },
                {
                  Header: 'Stores',
                  accessor: 'store_count',
                  Cell: cell => <div>{cell.value}</div>,
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptionsFromAccessor('store_count')
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
                }
              ]
            },
            {
              Header: 'Performance',
              columns: [
                {
                  Header: 'Cumulative CPU',
                  accessor: 'cumulative_cpu_percent',
                  Cell: cell => (cell.value ? cell.value.toFixed(0) : ''),
                  maxWidth: calcWidth(4),
                  className: 'right',
                  Filter: '%',
                  Footer: this.average
                },
                {
                  Header: 'Storefront (uncached)',
                  accessor: 'store_url_uncached',
                  Cell: cell => (<a target="_blank" rel="noopener noreferrer" href={'https://' + cell.original.host_name}>{this.formatSecs(cell.value)}</a>),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Storefront (cached)',
                  accessor: 'store_url_cached',
                  Cell: cell => (<a target="_blank" rel="noopener noreferrer" href={'https://' + cell.original.host_name}>{this.formatSecs(cell.value)}</a>),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Cat Page (uncached)',
                  accessor: 'cat_url_uncached',
                  Cell: cell => (<a target="_blank" rel="noopener noreferrer" href={cell.original.cat_url}>{this.formatSecs(cell.value)}</a>),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Cat Page (partial cache)',
                  accessor: 'cat_url_partial_cache',
                  Cell: cell => (<a target="_blank" rel="noopener noreferrer" href={cell.original.cat_url}>{this.formatSecs(cell.value)}</a>),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Cat Page (cached)',
                  accessor: 'cat_url_cached',
                  Cell: cell => (<a target="_blank" rel="noopener noreferrer" href={cell.original.cat_url}>{this.formatSecs(cell.value)}</a>),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Cat Page Products',
                  accessor: 'cat_url_product_count',
                  Cell: cell => (
                    <Tooltip placement="right" title={cell.value ? cell.value : 'n/a'} enterDelay={20} leaveDelay={20}>
                      {this.validate(cell.value, v => v > 0, this.checkIcon, this.errorIcon)}
                    </Tooltip>
                  ),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptions(this.passFailFilters),
                  filterMethod: this.zeroIsFailing
                },
                {
                  Header: 'Search Page (partial cache)',
                  accessor: 'search_url_partial_cache',
                  Cell: cell => this.formatSecs(cell.value),
                  maxWidth: calcWidth(4.5),
                  className: 'right',
                  Filter: this.timerIcon,
                  Footer: this.average
                },
                {
                  Header: 'Search Page Products',
                  accessor: 'search_url_product_count',
                  Cell: cell => (
                    <Tooltip placement="right" title={cell.value ? cell.value : 'n/a'} enterDelay={20} leaveDelay={20}>
                      {this.validate(cell.value, v => v > 0, this.checkIcon, this.errorIcon)}
                    </Tooltip>
                  ),
                  maxWidth: calcWidth(2),
                  className: 'right',
                  Filter: this.createFilterOptions(this.passFailFilters),
                  filterMethod: this.zeroIsFailing
                },
              ]
            },
            {
              Header: 'Test Info',
              columns: [
                {
                  Header: '% Load Change',
                  accessor: 'utilization_start_end',
                  className: 'right',
                  Cell: cell => {
                    if (cell.value) {
                      const vals = cell.value.split(',')
                      return parseInt(vals[4],10) - parseInt(vals[1],10)
                    }
                    return ''
                  },
                  maxWidth: calcWidth(4),
                  Filter: ({filter, onChange}) => (
                    <select
                      onChange={event => onChange(event.target.value)}
                      style={{width: '100%'}}
                      value={filter ? filter.value : 'all'}>
                      <option value="">Show All</option>
                      <optgroup>
                        <option key={'significant'} value="significant">
                          ±10
                        </option>
                        <option key={'untested'} value="untested">
                          untested
                        </option>
                      </optgroup>
                    </select>
                  ),
                  filterMethod: (filter, row) => {
                    let vals
                    switch (filter.value) {
                      case 'untested':
                        return row[filter.id] === null
                      case 'significant':
                        if (row[filter.id] === null) {
                          return false
                        }
                        vals = row[filter.id].split(',')
                        return Math.abs(parseInt(vals[4],10) - parseInt(vals[1],10)) > 10
                      default:
                        return true
                    }
                  },
                  sortMethod: (a, b) => {
                    const parseDiff = x => {
                      if (x === null || x === undefined) {
                        return -Infinity
                      }
                      const vals = x.split(',')
                      return parseInt(vals[4],10) - parseInt(vals[1],10)
                    }
                    a = parseDiff(a)
                    b = parseDiff(b)
                    if (a > b) {
                      return 1;
                    }
                    if (a < b) {
                      return -1;
                    }
                    return 0;
                  }
                },
                {
                  Header: 'Updated',
                  accessor: 'timestamp',
                  Cell: cell => cell.value ? this.formatDate(cell.value) : '',
                  //Cell: cell => cell.value ? moment(new Date(cell.value * 1000)).fromNow() : '',
                  maxWidth: calcWidth(3),
                  className: 'right',
                  Filter: this.createFilterOptions([this.testedFilter, this.untestedFilter]),
                  filterMethod: this.createFilterMethod([this.testedFilter, this.untestedFilter])
                }
              ]
            }
          ]}
        />
      </div>
    )
  }
}
