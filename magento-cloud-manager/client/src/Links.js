import React from 'react'
import {Link} from 'react-router-dom'

export default function Links() {
  return (
    <div>
      <Link to={'/'}>Home</Link>
      <br/>
      <Link to={'/hosts'}>Hosts</Link>
      <br/>
      <Link to={'/environments'}>Environments</Link>
    </div>
  )
}
