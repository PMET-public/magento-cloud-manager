#! /bin/bash
timeout 10 redis-cli -h redis.internal -n 0 info >/dev/null

if [ $? != 0 ]; then
  (>&2 echo "Redis did not respond in < 10 sec.")
  exit 1
fi

