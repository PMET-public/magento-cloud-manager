#! /bin/bash

error=0

echo 'Checking IP addresses of services'
grep -E -q '^169\.254' /etc/hosts
if [ $? -ne 0 ]; then
  (>&2 echo 'Services found with self-assigned IPs. May cause conflict.')
  error=1
fi

echo 'Checking redis'
timeout 5 redis-cli -h redis.internal -n 0 info >/dev/null
if [ $? -ne 0 ]; then
  (>&2 echo 'Redis error or did not respond in < 5 sec.')
  error=1
fi

echo 'Checking mysql'
admin_count=$(timeout 5 mysql main -sN -h database.internal -e "SELECT count(*) FROM admin_user")
if [ $? -ne 0 ]; then
  (>&2 echo 'Mysql error or did not respond in < 5 sec.')
  error=1
elif [ "$admin_count" -eq 0 ]; then
  (>&2 echo 'No admin users found.')
  error=1
fi

echo 'Checking elasticsearch'
timeout 5 curl http://elasticsearch.internal:9200/ >/dev/null
if [ $? -ne 0 ]; then
  (>&2 echo 'Elasticsearch error or did not respond in < 5 sec.')
  error=1
fi

echo 'Checking rabbitmq'
timeout 5 curl -u guest:guest http://mq.internal:5672/api/vhosts >/dev/null
exit_status=$?
if [ $exit_status -ne 0 ]; then
  if [ $exit_status -ne 56 ]; then
    (>&2 echo 'Rabbitmq error or did not respond in < 5 sec.')
    error=1
  fi 
fi 

echo 'Checking web app'
http_status=$(timeout 5 curl -sI localhost | sed -n "s/HTTP\\/1.1 \\([0-9]*\\).*/\\1/p")
if [ $? -ne 0 ]; then
  (>&2 echo 'web server error or did not respond in < 5 sec.')
  error=1
elif [ "$http_status" -ne 302 ]; then
  (>&2 echo "Server responded with unexpected HTTP reponse status: $http_status")
  error=1
fi

if [ $error -ne 0 ]; then
  exit 1
fi