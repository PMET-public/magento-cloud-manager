const moment = require('moment')

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

exports.moment = moment

exports.calcWidth = maxExpectedChars => {
  const minWidth = 25
  const width = maxExpectedChars * 11
  return width < minWidth ? minWidth : width
}

// http://www.stat.wmich.edu/s216/book/node122.html
exports.removePercentOutliers = (arrXY, percentOutliers) => {
  const n = arrXY.length
  arrXY.sort((a,b) => a.x - b.x)
  const subsetSize = Math.round(n * (100 - percentOutliers)/100)
  const offset = Math.floor((n-subsetSize)/2)
  return arrXY.slice(offset,subsetSize)
}

exports.calcCoefficient = (arrXY) => {
  let n = arrXY.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXsquared = 0
  let sumYsquared = 0

  arrXY.forEach(({x, y}) => {
    sumX += x
    sumY += y
    sumXY += x*y
    sumXsquared += x*x
    sumYsquared += y*y
  })

  return (sumXY - (sumX*sumY/n))/Math.sqrt((sumXsquared - (sumX*sumX/n))*(sumYsquared - (sumY*sumY/n)))
}
