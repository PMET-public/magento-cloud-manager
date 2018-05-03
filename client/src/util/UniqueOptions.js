import React from 'react'

export default function UniqueOptions(props) {
  const {data, accessor} = props

  let options = []
  if (data && data.length && typeof data[0][accessor] !== 'undefined') {
    options = [...new Set(props.data.map(x => x[props.accessor]))].map(value => (
      <option key={value} value={value}>
        {value}
      </option>
    ))
  }

  return <optgroup>{options}</optgroup>
}
