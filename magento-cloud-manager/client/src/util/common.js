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
