#! /bin/bash
php bin/magento admin:user:unlock sionly
php bin/magento admin:user:create --admin-user=sionly --admin-password=sionly4real \
  --admin-email=keithbentrup@gmail.com --admin-firstname=si --admin-lastname=only

if [ $? != 0 ]; then
  (>&2 echo '(Re)creating "sionly" user failed')
  exit 1
fi

