#! /bin/bash

error=0

echo -n Checking IP addresses of services ...
grep -E -q '^169\.254' /etc/hosts
if [ $? -ne 0 ]; then
  (>&2 echo 'Services found with self-assigned IPs. May cause conflict.')
  error=1
else
  echo ' ok'
fi

echo -n Checking redis ...
timeout 5 redis-cli -h redis.internal -n 0 info >/dev/null
if [ $? -ne 0 ]; then
  (>&2 echo 'Redis error or did not respond in < 5 sec.')
  error=1
else
  echo ' ok'
fi

echo -n Checking mysql and app admin users ... 
admin_count=$(timeout 5 mysql main -sN -h database.internal -e "SELECT count(*) FROM admin_user")
if [ $? -ne 0 ]; then
  (>&2 echo 'Mysql error or did not respond in < 5 sec.')
  error=1
elif [ "$admin_count" -eq 0 ]; then
  (>&2 echo 'No admin users found.')
  error=1
else
  echo ' ok'
fi

echo -n Checking elasticsearch ... 
timeout 5 curl -s http://elasticsearch.internal:9200/ >/dev/null
if [ $? -ne 0 ]; then
  (>&2 echo 'Elasticsearch error or did not respond in < 5 sec.')
  error=1
else
  echo ' ok'
fi

echo -n Checking rabbitmq ... 
timeout 5 curl -s -u guest:guest http://mq.internal:5672/api/vhosts >/dev/null
exit_status=$?
if [ $exit_status -ne 0 ]; then
  if [ $exit_status -ne 56 ]; then
    (>&2 echo 'Rabbitmq error or did not respond in < 5 sec.')
    error=1
  else
    echo ' ok'
  fi
fi

echo -n Checking web app ... 
location=$(timeout 30 curl -sI localhost | sed -n 's/Location: \(.*SID=.*\)/\1/p')
if [ $? -ne 0 ]; then
  (>&2 echo 'Web server error or did not respond in < 30 sec.')
  error=1
elif [ "$location" = "" ]; then
  (>&2 echo "Web server responded with unexpected response.")
  error=1
else
  curl -s "$location" | grep -q baseUrl
  if [ $? -ne 0 ]; then
    (>&2 echo 'Redirect url does not contain base url.')
    error=1
  fi
  echo ' ok'
fi

# low disk space test - any fs that's not > 90% full and is not "/" or "/app"
echo -n Checking available disk space ... 
fs=$(df -h | perl -ne '/[09]\d% (?!\/(app)?$)/ and print' | awk '{print $6 " " $5}')
if [ "$fs" = "" ]; then
  (>&2 echo "Mounts with low disk space: $fs")
  error=1
else
  echo ' ok'
fi

# tmp mysql table creation
# echo -n Checking DB speed ... 
copy_tbl_time=$({ /usr/bin/time -f "%e" mysql -h database.internal -u user -D main -e \
  "CREATE TABLE core_config_data_tmp AS (SELECT * FROM core_config_data); DROP TABLE core_config_data_tmp;";} 2>&1)
# if [ "$copy_tbl_time" -gt 1 ]; then
#   (>&2 echo "DB performing slowly. $copy_tbl_time sec to clone tmp config table.")
#   error=1
# else
#   echo ' ok'
# fi

# echo -n Checking utilization (loadavg / nproc) ...
# utilization=$(echo "print $(cat /proc/loadavg | awk '{print $1}') / $(nproc)" | perl)
# if [ "$utilization" -lt 2 ]; then
#   (>&2 echo "Current load avg is greater than twice # of cpus.")
#   error=1
# else
#   echo ' ok'
# fi

# current load avg (if under threshhold (eg. 1.2), try I/O test dd if= of=/)
# get last log error/exception

# resource availability tests
# CPU check (spawing multiple processes)
# RAM check


if [ $error -ne 0 ]; then
  exit 1
fi