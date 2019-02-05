import React from 'react'
import PropTypes from 'prop-types'

export default function UniqueOptions(props) {
  const {data, accessor} = props

  let options = []
  if (data && data.length && typeof data[0][accessor] !== 'undefined') {
    options = [...new Set(data.map(x => 
      accessor === 'cat_url' && x[accessor] !== null ? x[accessor].replace(/.*\//,'') : x[accessor]))]
    options = options.map(value => (
      <option key={value} value={value}>
        {value}
      </option>
    ))
  }

  return <optgroup>{options}</optgroup>
}

UniqueOptions.propTypes = {
  data: PropTypes.array.isRequired,
  accessor: PropTypes.string
}
