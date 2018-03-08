import React, {Component} from 'react'
import {Scatter, Line} from 'react-chartjs-2'

const data = {
  labels: ['Scatter'],
  datasets: [
    {
      label: 'Project A',
      fill: false,
      backgroundColor: 'rgba(75,192,192,0.4)',
      pointBorderColor: 'rgba(75,192,192,1)',
      pointBackgroundColor: '#fff',
      pointBorderWidth: 1,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: 'rgba(75,192,192,1)',
      pointHoverBorderColor: 'rgba(220,220,220,1)',
      pointHoverBorderWidth: 2,
      pointRadius: 1,
      pointHitRadius: 10,
      data: [
        {x: 65, y: 75},
        {x: 59, y: 49},
        {x: 80, y: 90},
        {x: 81, y: 29},
        {x: 56, y: 36},
        {x: 55, y: 25},
        {x: 40, y: 18}
      ]
    },
    {
      label: 'Project B',
      fill: false,
      backgroundColor: 'rgba(75,192,192,0.9)',
      pointBorderColor: 'rgba(75,192,192,1)',
      pointBackgroundColor: '#aaf',
      pointBorderWidth: 1,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: 'rgba(75,192,192,1)',
      pointHoverBorderColor: 'rgba(220,220,220,1)',
      pointHoverBorderWidth: 2,
      pointRadius: 1,
      pointHitRadius: 10,
      data: [
        {x: 69, y: 71},
        {x: 55, y: 41},
        {x: 80, y: 90},
        {x: 81, y: 21},
        {x: 59, y: 31},
        {x: 51, y: 21},
        {x: 40, y: 18}
      ]
    }
  ]
}

export default class extends Component {
  constructor(props) {
    super(props)
    this.state = {
      data: [],
      isLoaded: false
    }
  }

  componentDidMount() {
    fetch('/api/hosts_states/all')
      .then(res => res.json())
      .then(
        res => {
          const data = []
          res.forEach(row => {
            if (typeof data[row.project_id] === 'undefined') {
              data[row.project_id] = []
            }
            data[row.project_id].push({x: new Date(row.timestamp).toISOString(), y: row.load_avg_15})
          })
          this.setState({
            isLoaded: true,
            data: data
          })
        },
        // Note: it's important to handle errors here
        // instead of a catch() block so that we don't swallow
        // exceptions from actual bugs in components.
        error => {
          this.setState({
            isLoaded: true,
            error
          })
        }
      )
  }

  render() {
    return this.state.isLoaded ? (
      <div>
        <h2>Historic Load Avg</h2>
        <Line data={data} />
      </div>
    ) : (
      <div>Loading ...</div>
    )
  }
}
// export default class extends Component {

//   myChart() {
//     const ctx = document.getElementById('mychart')
//     new Chart(ctx, {
//       type: 'scatter',
//       data: {
//           datasets: [{
//               label: 'Scatter Dataset',
//               data: [{
//                   x: -10,
//                   y: 0
//               }, {
//                   x: 0,
//                   y: 10
//               }, {
//                   x: 10,
//                   y: 5
//               }]
//           }]
//       },
//       options: {
//           scales: {
//               xAxes: [{
//                   type: 'linear',
//                   position: 'bottom'
//               }]
//           }
//       }
//   })
//   }
