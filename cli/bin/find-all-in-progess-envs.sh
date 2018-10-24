#!/bin/bash

~/.magento-cloud/bin/magento-cloud multi -p (mc projects --pipe | perl -pe 's/\n/,/' | perl -pe 's/,$//') environments >/tmp/env-list.txt 2>&1

perl -i.1 -ne '/Project:|In progress/ and print' /tmp/env-list.txt

perl -i.2 -pe 's/.*\((.*)\)/($prev_match eq $1 ? "$1 " : (($prev_match="$1") && ""))/e;s/^\|\s+/$prev_match:/;s/ .*//' /tmp/env-list.txt | sed '/^$/d' | xargs