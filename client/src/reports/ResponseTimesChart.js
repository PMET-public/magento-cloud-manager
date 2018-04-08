import React, {Component} from 'react'
import {Scatter, defaults} from 'react-chartjs-2'
import {removePercentOutliers, calcCoefficient} from '../util/common'

defaults.global.animation = false
//defaults.global.tooltips.backgroundColor = 'rgba(200,200,200,0.8)'

export default class extends Component {
  constructor(props) {
    super(props)
    this.state = {
      data: [],
      correlation: 0,
      isLoaded: false,
      legendHtml: '',
      options: {
        // showLines: true,
        legend: {
          display: true,
          position: 'bottom'
        },
        tooltips: {
          callbacks: {
            beforeLabel: (tooltipItem, data) => {
              return `Host ${data.datasets[tooltipItem.datasetIndex].label}: `
            }
          }
        },
        scales: {
          display: true,
          labelString: 'hi',
          xAxes: [
            {
              display: true,
              labelString: 'Date',
              labels: {
                show: true
              },
              ticks: {
                min: 0,
                max: 0
              }
            }
          ],
          yAxes: [
            {
              display: true,
              labelString: 'Utilization',
              ticks: {
                min: 0,
                max: 0
              }
            }
          ]
        }
      }
    }
  }

  randomRange = (min, max) => Math.random() * (max - min) + min
  randomRangeInt = (min, max) => Math.floor(Math.random() * (max - min) + min)
  regionColors1 = () =>
    `rgba(244,${this.randomRangeInt(100, 200)},${this.randomRangeInt(0, 100)},${this.randomRange(0.5, 1)}`
  regionColors2 = () =>
    `rgba(${this.randomRangeInt(0, 100)},${this.randomRangeInt(100, 200)},244,${this.randomRange(0.5, 1)}`
  regions = {}
  titles = {}

  fetchData = () => {
    fetch('/response-times')
      .then(res => res.json())
      .then(
        res => {
          const responseData = {}
          const data = {
            labels: ['Response times'],
            datasets: []
          }
          let maxX = 0
          let maxY = 0
          let allXY = []
          // group rows by project
          res.forEach(row => {
            const label = `${row.region}-${row.title.replace(/-.*/, '')}-${row.ee_composer_version}`
            if (typeof responseData[label] === 'undefined') {
              responseData[label] = []
            }
            // avg utilization of start and end
            const x =
              (parseInt(row.utilization_start.split(',')[0], 10) + parseInt(row.utilization_end.split(',')[0], 10)) / 2
            // just end
            // const x = parseInt(row.utilization_end.split(',')[0], 10)
            const y = Math.round(row.cat_url_uncached * 10) / 10
            maxX = x > maxX ? x : maxX
            maxY = y > maxY ? y : maxY
            responseData[label].push({x: x, y: y})
            allXY.push({x: x, y: y})
            this.regions[label] = row.region
            this.titles[label] = label
          })

          allXY = removePercentOutliers(allXY, 5)
          console.log('coef', calcCoefficient(allXY))

          Object.entries(responseData).forEach(([key, val]) => {
            const c = this.regions[key] === 'us-3' ? this.regionColors1() : this.regionColors2()
            data.datasets.push({
              label: `${this.titles[key]}`,
              fill: false,
              borderColor: c,
              backgroundColor: c,
              pointBorderColor: c,
              //pointBackgroundColor: '#fff',
              pointBorderWidth: 1,
              pointHoverRadius: 5,
              //pointHoverBackgroundColor: 'rgba(75,192,192,1)',
              //pointHoverBorderColor: 'rgba(220,220,220,1)',
              pointHoverBorderWidth: 2,
              pointRadius: 2,
              pointHitRadius: 10,
              data: val.sort((a, b) => a.x - b.x)
            })
          })
          this.setState((prevState, props) => {
            const newState = Object.assign({}, prevState, {isLoaded: true, data: data})
            newState.options.scales.xAxes[0].ticks.max = maxX
            newState.options.scales.yAxes[0].ticks.max = Math.ceil(maxY)
            return newState
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

  componentDidMount() {
    this.fetchData()
  }

  render() {
    return this.state.isLoaded ? (
      <div>
        <h2>Response Times vs. Utilization Under Test</h2>
        <Scatter data={this.state.data} options={this.state.options} height={250} />
      </div>
    ) : (
      <div>Loading ...</div>
    )
  }
}
