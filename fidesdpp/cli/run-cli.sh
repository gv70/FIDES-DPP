#!/bin/bash
# Wrapper script to run CLI with correct NODE_PATH
# This ensures the CLI uses dependencies from the parent project

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PARENT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Set NODE_PATH to include parent node_modules
export NODE_PATH="$PARENT_DIR/node_modules:$NODE_PATH"

# Run tsx with the CLI entry point
cd "$SCRIPT_DIR"
npx tsx src/index.ts "$@"

