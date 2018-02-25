import React, {Component} from 'react'
import ProjectSearch from './ProjectSearch'
import SelectedProjects from './SelectedProjects'
import HostUtilization from './HostUtilization'
import Environments from './Environments'
import matchSorter from 'match-sorter'
import Client from './Client'

class App extends Component {
  constructor() {
    super()
    this.state = {
      /* hostsStates: Client.search('/api/hosts_states/current', rows => {
        return rows
      } ), */
      selectedProjects: []
    }
  }

  removeProjectItem = itemIndex => {
    const filteredProjects = this.state.selectedProjects.filter((item, idx) => itemIndex !== idx)
    this.setState({selectedProjects: filteredProjects})
  }

  addProject = project => {
    const newProjects = this.state.selectedProjects.concat(project)
    this.setState({selectedProjects: newProjects})
  }

  render() {
    const {hostsStates, selectedProjects} = this.state
    return (
      <div>
        <SelectedProjects projects={this.state.selectedProjects} onProjectClick={this.removeProjectItem} />
        <ProjectSearch onProjectClick={this.addProject} />
        <br />
        <div style={{padding: '25px'}}>
          <HostUtilization />
          <Environments />
        </div>
      </div>
    )
  }
}

export default App
