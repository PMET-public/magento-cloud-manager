#!/bin/bash

MCM_DIR="$( cd $(dirname $0)/.. ; pwd -P )"

slack_url=$(perl -nle '/slackUrl.*:\s*"(.*)"/ and print $1' "${MCM_DIR}/cli/.secrets.json")

report="$("${MCM_DIR}/cli/bin/mcm" env:report-web-status)"

if [[ ! -z "$report" ]]; then
  echo "${report//\"/\\\"}"
#   curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"@here \`\`\`
# ${report//\"/\\\"}
# \`\`\`\"}" "$slack_url"
  curl -X POST -H 'Content-type: application/json' --data "{
          \"type\": \"mrkdwn\",
          \"text\": \"
            ${report//\"/\\\"}
          \"
  }" "$slack_url"
fi

