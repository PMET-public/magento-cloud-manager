#! /bin/bash

for d in /var/log /app/var/log; do
  cd $d
  for i in *.log; do
    # can't just tail then mv b/c of permissions on /var/log
    tail -1000 $i > /tmp/$i.tmp
    cat /tmp/$i.tmp > $d/$i
    rm /tmp/$i.tmp
  done
done
