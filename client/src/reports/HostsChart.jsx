import React, {Component} from 'react'
import {Scatter, defaults} from 'react-chartjs-2'

defaults.global.animation = false
//defaults.global.tooltips.backgroundColor = 'rgba(200,200,200,0.8)'


// const getNthRGBTriple = (startTriple, endTriple, size, index) => {
//   // validate index < size && all numbers are ints 0 <= x <=255 
//   const isIntBetween0and255 = val => Number.isInteger(val) && val > -1 && val < 256
//   if (!( index < size && startTriple.concat(endTriple, size, index).reduce((acc, val) => acc && isIntBetween0and255(val), true))) {
//     throw 'Failed input validation.'
//   }
//   const [startR, startG, startB] = startTriple
//   const [endR, endG, endB] = endTriple

//   const getStep = (start, end, size) => (end - start) / (size - 1)
//   const stepR = getStep(startR, endR, size)
//   const stepG = getStep(startG, endG, size)
//   const stepB = getStep(startB, endB, size)
  
//   const getNthVal = (start, step, index) => start + parseInt(step * index, 10)
//   return [
//     getNthVal(startR, stepR, index),
//     getNthVal(startG, stepG, index),
//     getNthVal(startB, stepB, index)
//   ]

// }

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
  dayOpts = [1, 7, 14, 30, 180]
  msInDay = 1000 * 24 * 60 * 60
  randomRange = (min, max) => Math.random() * (max - min) + min
  randomRangeInt = (min, max) => Math.floor(Math.random() * (max - min) + min)
  labels = {}
  regions = {
    'ap-3': {
      'color': { // bluish
        start: [0, 0, 204],
        end: [102, 204, 255],
        size: 0
      }
    },
    'demo': {
      color: { // greenish
        start: [100, 50, 0],
        end: [255, 204, 50],
        size: 0
      }
    },
    'eu-3': {
      color: { // purplish
        start: [153, 0, 204],
        end: [204, 204, 255],
        size: 0
      }
    },
    'us': {
      color: { // orange
        start: [204, 122, 0],
        end: [255, 224, 179],
        size: 0
      }
    },
    'us-3': {
      color: { // redish
        start: [153, 0, 0],
        end: [255, 128, 128],
        size: 0
      }
    }
  }

  fetchData = days => {
    fetch('/hosts-states-historic?days=' + days, {credentials: 'same-origin'})
      .then(res => res.json())
      .then(
        res => {
          const hostsData = {}
          const hosts = {}
          const data = {
            labels: ['Historic Host 15 min load avg'],
            datasets: []
          }
          let minX = 0
          let maxY = 0

          // group rows by host
          res.forEach(row => {
            if (typeof hostsData[row.host_id] === 'undefined') {
              hostsData[row.host_id] = []
              const nthInRegion = this.regions[row.region].color.size
              hosts[row.host_id] = {
                label: row.region + ' ' + row.host_id,
                region: row.region,
                nthInRegion: nthInRegion
              }
              this.regions[row.region].color.size = nthInRegion + 1
            }
            // convert timestamp into "days ago"
            // use Math.round(x * 100) / 100 for 2 decimal places
            const x = Math.round((new Date(row.timestamp * 1000) - new Date()) * 100 / this.msInDay) / 100
            const y = Math.round(row.load_avg_15 * 100 / row.cpus) / 100
            minX = x < minX ? x : minX
            maxY = y > maxY ? y : maxY
            hostsData[row.host_id].push({x: x, y: y})
          })

          Object.entries(hostsData).forEach(([key, val], index) => {
            const host = hosts[key]
            const rc = this.regions[host.region].color
            // color algorithm change based on
            // https://stackoverflow.com/questions/10014271/generate-random-color-distinguishable-to-humans
            //const c = getNthRGBTriple(rc.start, rc.end, rc.size, host.nthInRegion)
            const c = host.nthInRegion * (360 / (rc.size < 1 ? 1 : rc.size)) % 360
            data.datasets.push({
              label: host.label,
              fill: false,
              //borderColor: 'rgba(' + c.join(',') + ',1)',
              borderColor: 'hsl(' + c + ', 70%, 50%)',
              //backgroundColor: 'rgba(' + c.join(',') + ',1)',
              backgroundColor: 'hsl(' + c + ', 70%, 50%)',
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
    this.fetchData(7)
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
