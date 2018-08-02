import React from 'react'
// import Tooltip from 'material-ui/Tooltip'
import PropTypes from 'prop-types'

export default function Gauge(props) {
  const {data} = props

  if (!data) {
    return null
  }

  const [util1, util5, util15] = data.split(',')

  const gauge = util => (
    <div className="gauge-wrapper" style={{width: util + '%'}}>
      <div className={'gauge'} style={{background: util > 100 ? `rgba(${155 + util % 100},0,0,1)` : ''}} />
    </div>
  )
  // <Tooltip placement="right" title={'test'} enterDelay={20} leaveDelay={20}>test</Tooltip>
  return (
    <div style={{width: '100%'}}>
      {gauge(util1)}
      {gauge(util5)}
      {gauge(util15)}
    </div>
  )
}

Gauge.propTypes = {
  data: PropTypes.object.isRequired
}
