#!/bin/bash

set -e
set -x

[[ "$#" -eq 1 ]] ||
  {
    echo "Please enter 1 project id." &&
    exit
  }

[[ "$1" =~ ^[a-z0-9]{13}$ ]] ||
  { 
    echo "Project id should be 13 alphanumeric chars." &&
    exit
  }

sqlite3 cloud.db "
  delete from projects where id = '$1';
  delete from hosts_states where project_id = '$1';
  delete from users where project_id = '$1';
  delete from environments where project_id = '$1';
  delete from smoke_tests where project_id = '$1';
  delete from applications where project_id = '$1';
  delete from web_statuses where host_name like '%-$1.%';
  VACUUM;
"
