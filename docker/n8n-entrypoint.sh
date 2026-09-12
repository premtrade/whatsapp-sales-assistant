#!/bin/sh
# Custom entrypoint to run both webhook and start

# Start webhook in background
n8n webhook &
WEBHOOK_PID=$!

# Start main process
exec n8n start