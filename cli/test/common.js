const {exec} = require('../src/common')

exports.execCmd = async (args = '') => {
  const cmd = `../bin/mcm ${args}`
  const result = exec(cmd, {cwd: __dirname}).catch(error => error)
  return result
}

// return a list of possible pairs for the given array
const choose2 = function r(arr) {
  const combos = []
  const len = arr.length
  if (len > 2) {
    for (let i = 1; i < len; i++) {
      combos.push([arr[0], arr[i]])
    }
    return combos.concat(choose2(arr.slice(1)))
  } else if (len === 2) {
    return [[arr[0], arr[1]]]
  } else {
    throw 'Array must have at least 2 elements'
  }
}
exports.choose2 = choose2

