#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/artifacts/firmware"
HARDWARE_DIR="$ARTIFACT_DIR/hardware"
HARDWARE_ZIP="$ARTIFACT_DIR/hardware.zip"

mkdir -p "$ARTIFACT_DIR"
rm -rf "$HARDWARE_DIR"

curl -L -o "$HARDWARE_ZIP" "https://artifactory.expresslrs.org/ExpressLRS/hardware.zip"
mkdir -p "$HARDWARE_DIR"
unzip -q "$HARDWARE_ZIP" -d "$HARDWARE_DIR"
rm -f "$HARDWARE_ZIP"

echo "Hardware artifacts downloaded to $HARDWARE_DIR"
