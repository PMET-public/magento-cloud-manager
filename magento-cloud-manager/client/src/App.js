import React, {Component} from 'react'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import ProjectSearch from './ProjectSearch'
import SelectedProjects from './SelectedProjects'

class App extends Component {
  constructor() {
    super()
    this.state = {
      data: [],
      selectedProjects: []
    }
  }

  removeProjectItem = itemIndex => {
    const filteredProjects = this.state.selectedProjects.filter(
      (item, idx) => itemIndex !== idx
    );
    this.setState({ selectedProjects: filteredProjects });
  };

  addProject = project => {
    const newProjects = this.state.selectedProjects.concat(project);
    this.setState({ selectedProjects: newProjects });
  };


  render() {
    const {data} = this.state
    return (
      <div>
        <SelectedProjects
        projects={this.state.selectedProjects}
        onProjectClick={this.removeProjectItem}
        />
        <ProjectSearch onProjectClick={this.addProject} />
      </div>
    )
  }
}

export default App
