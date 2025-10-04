#!/bin/bash

# Pull reference repositories for SmartBox heater integration
# These are used as reference for the API implementation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REFERENCE_DIR="$PROJECT_ROOT/reference"

echo "Pulling SmartBox reference repositories..."
echo "Reference directory: $REFERENCE_DIR"
echo ""

# Create reference directory if it doesn't exist
mkdir -p "$REFERENCE_DIR"

# Pull hass-smartbox (Home Assistant integration)
echo "1. Pulling hass-smartbox..."
if [ -d "$REFERENCE_DIR/hass-smartbox" ]; then
  echo "   Directory exists, pulling latest changes..."
  cd "$REFERENCE_DIR/hass-smartbox"
  git pull
else
  echo "   Cloning repository..."
  git clone https://github.com/ajtudela/hass-smartbox.git "$REFERENCE_DIR/hass-smartbox"
fi
echo "   ✓ Done"
echo ""

# Pull smartbox (Python library)
echo "2. Pulling smartbox..."
if [ -d "$REFERENCE_DIR/smartbox" ]; then
  echo "   Directory exists, pulling latest changes..."
  cd "$REFERENCE_DIR/smartbox"
  git pull
else
  echo "   Cloning repository..."
  git clone https://github.com/ajtudela/smartbox.git "$REFERENCE_DIR/smartbox"
fi
echo "   ✓ Done"
echo ""

echo "All reference repositories updated successfully!"
