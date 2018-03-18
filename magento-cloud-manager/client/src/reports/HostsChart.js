import React, {Component} from 'react'
import {Scatter, defaults} from 'react-chartjs-2'
defaults.global.animation = false

export default class extends Component {
  constructor(props) {
    super(props)
    this.state = {
      data: [],
      options: {},
      isLoaded: false
    }
  }

  componentDidMount() {
    fetch('/hosts-states-historic')
      .then(res => res.json())
      .then(
        res => {
          const projData = {}
          const data = {
            labels: ['Historic Host 15 min load avg 2'],
            datasets: []
          }
          const msInDay = 1000*24*60*60
          const randomRange = (min, max) => {
            return Math.random() * (max - min) + min;
          }
          const randomRangeInt = (min, max) => {
            return Math.floor(Math.random() * (max - min) + min);
          }
          const regionColors1 = () => `rgba(244,${randomRangeInt(100,200)},${randomRangeInt(0,100)},${randomRange(0.5, 1)}`
          const regionColors2 = () => `rgba(${randomRangeInt(0,100)},${randomRangeInt(100,200)},244,${randomRange(0.5, 1)}`
          const regions = {}
          const titles = {}
          let minX = 0
          let maxY = 0

          // group rows by project
          res.forEach(row => {
            if (typeof projData[row.project_id] === 'undefined') {
              projData[row.project_id] = []
            }
            // convert timestamp into "days ago"
            let x = (new Date(row.timestamp) - new Date())/msInDay
            let y = row.load_avg_15 / row.cpus
            minX = x < minX ? x : minX
            maxY = y > maxY ? y : maxY
            projData[row.project_id].push({x: x, y: y})
            regions[row.project_id] = row.region
            titles[row.project_id] = row.title
          })

          Object.entries(projData).forEach(([key, val]) => {
            const c = regions[key] === 'us-3' ? regionColors1() : regionColors2()
            data.datasets.push({
              label: `${titles[key]} (${regions[key]}, ${key})`,
              fill: false,
              borderColor: c,
              backgroundColor: c,
              pointBorderColor: 'rgba(0,100,100,1)',
              //pointBackgroundColor: '#fff',
              pointBorderWidth: 1,
              pointHoverRadius: 5,
              //pointHoverBackgroundColor: 'rgba(75,192,192,1)',
              //pointHoverBorderColor: 'rgba(220,220,220,1)',
              pointHoverBorderWidth: 2,
              pointRadius: 1,
              pointHitRadius: 10,
              data: val
            })
          })
          // create a line at 1 to color the area underneath
          data.datasets.push({
            data: [{x: 0, y: 1}, {x: minX, y: 1}],
            label: '100% Utilization',
            backgroundColor: 'rgba(170, 226, 183, 0.5)',
            borderColor: 'rgba(170, 226, 183, 1)',
            borderWidth: 2,
            pointBorderWidth: 0
          })
          data.datasets.push({
            data: [{x: 0, y: Math.ceil(maxY)}, {x: minX, y: Math.ceil(maxY)}],
            label: 'Over Utilized',
            backgroundColor: 'rgba(255, 100, 100, 0.15)',
            borderColor: 'rgba(255, 100, 100, 0.15)'
          })
          this.setState({
            isLoaded: true,
            data: data,
            options : {
              // backgroundColor:'rgb(10,10,10)',
              showLines: true,
              legend: {
                display: true,
                position: 'bottom'
              },
              scales: {
                xAxes: [
                  {
                    display: true,
                    labelString: 'Date',
                    labels: {
                      show: true
                    },
                    time: {
                      unit: 'day'
                    },
                    ticks: {
                      min: minX,
                      max: 0
                    }
                  }
                ],
                yAxes: [
                  {
                    display: true,
                    labelString: 'Utilization',
                    ticks: {
                      max: Math.ceil(maxY)
                    }
                  }
                ]
              }
            }
          })
        },
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
        <h2>Historic Utilization</h2>
        <Scatter data={this.state.data} options={this.state.options} height={250} />
      </div>
    ) : (
      <div>Loading ...</div>
    )
  }
}
