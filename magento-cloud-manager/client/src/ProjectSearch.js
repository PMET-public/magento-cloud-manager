import React from 'react'
import Client from './Client'

const MATCHING_ITEM_LIMIT = 25

class ProjectSearch extends React.Component {
  state = {
    projects: [],
    showRemoveIcon: false,
    searchValue: ''
  }

  handleSearchChange = e => {
    const value = e.target.value

    this.setState({
      searchValue: value
    })

    if (value === '') {
      this.setState({
        projects: [],
        showRemoveIcon: false
      })
    } else {
      this.setState({
        showRemoveIcon: true
      })

      Client.search(`/api/projects?q=${value}`, projects => {
        this.setState({
          projects: projects.slice(0, MATCHING_ITEM_LIMIT)
        })
      })
    }
  }

  handleSearchCancel = () => {
    this.setState({
      projects: [],
      showRemoveIcon: false,
      searchValue: ''
    })
  }

  render() {
    const {showRemoveIcon, projects} = this.state
    const removeIconStyle = showRemoveIcon ? {} : {visibility: 'hidden'}

    const projectRows = projects.map((project, idx) => (
      <tr key={idx} onClick={() => this.props.onProjectClick(project)}>
        <td>{project.description}</td>
        <td className="right aligned">{project.title}</td>
      </tr>
    ))

    return (
      <div id="project-search">
        <table className="ui selectable structured large table">
          <thead>
            <tr>
              <th colSpan="5">
                <div className="ui fluid search">
                  <div className="ui icon input">
                    <input
                      className="prompt"
                      type="text"
                      placeholder="Search projects..."
                      value={this.state.searchValue}
                      onChange={this.handleSearchChange}
                    />
                    <i className="search icon" />
                  </div>
                  <i className="remove icon" onClick={this.handleSearchCancel} style={removeIconStyle} />
                </div>
              </th>
            </tr>
            <tr>
              <th>Id</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>{projectRows}</tbody>
        </table>
      </div>
    )
  }
}

export default ProjectSearch
