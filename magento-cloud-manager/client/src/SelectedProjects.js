import React from 'react'

export default function SelectedProjects(props) {
  const {projects} = props

  const projectRows = projects.map((project, idx) => (
    <tr key={idx} onClick={() => props.onProjectClick(idx)}>
      <td>{project.id}</td>
      <td className="right aligned">{project.title}</td>
    </tr>
  ))

  return (
    <table className="ui selectable structured large table striped">
      <thead>
        <tr>
          <th colSpan="5">
            <h3>Selected Projects</h3>
          </th>
        </tr>
        <tr>
          <th>Id</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>{projectRows}</tbody>
      <tfoot>
        <tr>
          <th>Total</th>
          <th className="right aligned" id="total-kcal" />
        </tr>
      </tfoot>
    </table>
  )
}

// function sum(foods, prop) {
//   return foods
//     .reduce((memo, food) => parseInt(food[prop], 10) + memo, 0.0)
//     .toFixed(2);
// }
