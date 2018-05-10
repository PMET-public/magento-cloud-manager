#!/usr/bin/env bash

# create new tables from originals
perl -pe 's/" \($/_new" \(/' cloud.sql > 1-create-new-tables.sql

# insert old values into new tables
perl -ne 's/^.`(.*)`.*/\1/ and print "$1, "; 
  s/CREATE TABLE..(.*)".*$/\n${1} (/ and chomp and print' cloud.sql > 2-copy-into-new-tables.sql

perl -i -ne 's/^(.*?) \((.*), $/insert into ${1}_new \(${2}\) select * from ${1};/ and print' 2-copy-into-new-tables.sql

# drop old tables and rename new tables
perl -ne 's/^CREATE TABLE "(.*)".*$/DROP TABLE ${1}; ALTER TABLE ${1}_new RENAME TO ${1};/ 
  and print' cloud.sql > 3-drop-old-rename-new-tables.sql

echo -n "Backing up db ... "
cp cloud.db cloud.bak.db
echo "ok"

echo "Modify 1-create-new-tables.sql with your changes and run:"
echo "  cat *-new-tables.sql | sqlite3 cloud.db; sqlite3 cloud.db 'VACUUM;'"
