#!/bin/bash

# Start Chrome with remote debugging enabled
# This allows Playwright to connect to an existing browser instance

CHROME_PATH=""

# Detect Chrome installation path
if command -v google-chrome &> /dev/null; then
    CHROME_PATH="google-chrome"
elif command -v chromium-browser &> /dev/null; then
    CHROME_PATH="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROME_PATH="chromium"
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -f "/usr/bin/google-chrome-stable" ]; then
    CHROME_PATH="/usr/bin/google-chrome-stable"
else
    echo "Chrome/Chromium not found. Please install Chrome first."
    exit 1
fi

echo "Starting Chrome with remote debugging..."
echo "Chrome will be available at: http://localhost:9222"
echo "To stop Chrome, press Ctrl+C"

"$CHROME_PATH" \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=TranslateUI \
    --disable-dev-shm-usage \
    --no-sandbox \
    --user-data-dir=/tmp/chrome-debug-data \
    https://one.dat.com/search-loads-ow
