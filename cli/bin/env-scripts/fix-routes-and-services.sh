#!/bin/bash

perl -i -pe 's/rabbitmq\s*$/rabbitmq:3.5\n/' ./.magento/services.yaml

cat << 'EOF' > ./.magento/routes.yaml
# The routes of the project.
#
# Each route describes how an incoming URL is going to be processed.

"http://{default}/":
  type: upstream
  upstream: "mymagento:http"

"http://{all}/":
  type: upstream
  upstream: "mymagento:http"

EOF
