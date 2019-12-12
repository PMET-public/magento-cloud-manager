#! /bin/bash

./vendor/bin/m2-ece-deploy

if [ $? != 0 ]; then
  (>&2 echo 'm2-ece-deploy failed')
  exit 1
fi

