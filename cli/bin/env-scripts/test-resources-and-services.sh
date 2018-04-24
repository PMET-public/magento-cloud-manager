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
http_status=$(timeout 5 curl -sI localhost | sed -n "s/HTTP\\/1.1 \\([0-9]*\\).*/\\1/p")
if [ $? -ne 0 ]; then
  (>&2 echo 'web server error or did not respond in < 5 sec.')
  error=1
elif [ "$http_status" -ne 302 ]; then
  (>&2 echo "Server responded with unexpected HTTP reponse status: $http_status")
  error=1
else
  echo ' ok'
fi

# remote network check
# low disk space test - any FS that's not > 90% full and is not "/" or "/app"
# df -h | perl -ne '/[09]\d% (?!\/(app)?$)/ and print' 
# current load avg (if under threshhold (eg. 1.2), try I/O test dd if= of=/)
# tmp mysql table creation
# copy_tbl_time=$({ /usr/bin/time -f "%e" mysql -h database.internal -u user -D main -e "CREATE TABLE core_config_data_tmp AS (SELECT * FROM core_config_data); DROP TABLE core_config_data_tmp;";} 2>&1)
# url with FQDN check (should check router container)
# certificate check
# get last log error/exception

# resource availability tests
# CPU check (spawing multiple processes)
# RAM check


if [ $error -ne 0 ]; then
  exit 1
fi