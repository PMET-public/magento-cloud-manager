#!/bin/bash

set -e
set -x

sqlite3 cloud.db "
  delete from hosts_states where project_id in (select id from projects where region != 'demo');
  delete from users where project_id in (select id from projects where region != 'demo');
  delete from environments where project_id in (select id from projects where region != 'demo');
  delete from smoke_tests where project_id in (select id from projects where region != 'demo');
  delete from applications where project_id in (select id from projects where region != 'demo');
  delete from web_statuses where host_name not like '%.demo.%';
  delete from projects where id in (select id from projects where region != 'demo');
"
