import React, {Component} from 'react'
import {Scatter, defaults} from 'react-chartjs-2'

defaults.global.animation = false
//defaults.global.tooltips.backgroundColor = 'rgba(200,200,200,0.8)'

export default class extends Component {
  constructor(props) {
    super(props)
    //this.chartRefCallback = this.chartRefCallback.bind(this)
    this.state = {
      data: [],
      isLoaded: false,
      timeframe: this.maxDays,
      legendHtml: '',
      options: {
        showLines: true,
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

  maxDays = 10000
  msInDay = 1000 * 24 * 60 * 60
  randomRange = (min, max) => Math.random() * (max - min) + min
  randomRangeInt = (min, max) => Math.floor(Math.random() * (max - min) + min)
  regionColors1 = () =>
    `rgba(244,${this.randomRangeInt(100, 200)},${this.randomRangeInt(0, 100)},${this.randomRange(0.5, 1)}`
  regionColors2 = () =>
    `rgba(${this.randomRangeInt(0, 100)},${this.randomRangeInt(100, 200)},244,${this.randomRange(0.5, 1)}`
  regions = {}
  titles = {}

  fetchData = days => {
    fetch('/hosts-states-historic?days=' + days, {credentials: 'same-origin'})
      .then(res => res.json())
      .then(
        res => {
          const hostData = {}
          const data = {
            labels: ['Historic Host 15 min load avg'],
            datasets: []
          }
          let minX = 0
          let maxY = 0
          // group rows by host
          res.forEach(row => {
            if (typeof hostData[row.host_id] === 'undefined') {
              hostData[row.host_id] = []
            }
            // convert timestamp into "days ago"
            // use Math.round(x * 100) / 100 for 2 decimal places
            let x = Math.round((new Date(row.timestamp * 1000) - new Date()) * 100 / this.msInDay) / 100
            let y = Math.round(row.load_avg_15 * 100 / row.cpus) / 100
            minX = x < minX ? x : minX
            maxY = y > maxY ? y : maxY
            hostData[row.host_id].push({x: x, y: y})
            this.regions[row.host_id] = row.region
            this.titles[row.host_id] = row.host_id
          })

          Object.entries(hostData).forEach(([key, val]) => {
            const c = this.regions[key] === 'us-3' ? this.regionColors1() : this.regionColors2()
            data.datasets.push({
              label: `${this.titles[key]}`,
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
          this.setState((prevState, props) => {
            const newState = Object.assign({}, prevState, {isLoaded: true, data: data})
            newState.options.scales.xAxes[0].ticks.min = minX
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
    this.forceUpdate()
  }

  // chartRefCallback = el => {
  //   this.setState({legendHtml: el.chartInstance.generateLegend()})
  // }

  render() {
    return this.state.isLoaded ? (
      <div>
        <h2>Historic Utilization</h2>
        Show usage for
        <select onChange={event => this.fetchData(event.target.value)}>
          <option value="1">1 day</option>
          <option value="7">1 wk</option>
          <option value="14">2 wk</option>
          <option value="30">1 mo</option>
          <option value={this.maxDays}>all time</option>
        </select>
        <Scatter data={this.state.data} options={this.state.options} height={250} ref={this.chartRefCallback} />
        {/* <div dangerouslySetInnerHTML={{__html: this.state.legendHtml}} /> */}
      </div>
    ) : (
      <div>Loading ...</div>
    )
  }
}
