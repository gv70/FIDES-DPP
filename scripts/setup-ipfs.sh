#!/bin/bash
# Kubo IPFS setup for local development
# Usage: ./scripts/setup-ipfs.sh

set -e

echo "FIDES-DPP IPFS setup (Kubo)"

# Check if IPFS is installed
if ! command -v ipfs &> /dev/null; then
    echo "ERROR: IPFS (Kubo) is not installed."
    echo "Install: https://dist.ipfs.tech/#kubo"
    exit 1
fi

echo "OK: $(ipfs --version)"

# Check if already initialized
if [ -d "$HOME/.ipfs" ]; then
    echo "INFO: IPFS repository already exists at ~/.ipfs"
    read -p "Re-initialize? This will delete existing data. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "INFO: Removing existing repository..."
        rm -rf "$HOME/.ipfs"
    else
        echo "INFO: Using existing repository"
        SKIP_INIT=true
    fi
fi

# Initialize if needed
if [ "$SKIP_INIT" != "true" ]; then
    echo "INFO: Initializing IPFS repository..."
    ipfs init
    echo "OK: IPFS initialized"
fi

# Configure API and Gateway
echo "INFO: Configuring IPFS..."
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080

# Enable CORS for web app
echo "INFO: Enabling CORS..."
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "GET", "POST"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Credentials '["true"]'

echo "OK: Configuration updated"

# Check if daemon is already running
if pgrep -x "ipfs" > /dev/null; then
    echo "INFO: IPFS daemon appears to be running"
    read -p "Restart daemon? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "INFO: Stopping existing daemon..."
        pkill ipfs || true
        sleep 2
    else
        echo "INFO: Using existing daemon"
        SKIP_START=true
    fi
fi

# Start daemon
if [ "$SKIP_START" != "true" ]; then
    echo "INFO: Starting IPFS daemon (background)..."
    
    # Start in background
    ipfs daemon > /tmp/ipfs.log 2>&1 &
    IPFS_PID=$!
    
    # Wait a bit for daemon to start
    sleep 3
    
    # Check if it's running
    if ps -p $IPFS_PID > /dev/null; then
        echo "OK: IPFS daemon started (PID: $IPFS_PID)"
        echo "Logs: /tmp/ipfs.log"
    else
        echo "ERROR: Failed to start IPFS daemon"
        echo "Check logs: /tmp/ipfs.log"
        exit 1
    fi
fi

# Verify connection
echo "INFO: Verifying IPFS connection..."
sleep 2

if curl -s http://127.0.0.1:5001/api/v0/version > /dev/null; then
    VERSION=$(curl -s http://127.0.0.1:5001/api/v0/version | grep -o '"Version":"[^"]*"' | cut -d'"' -f4)
    echo "OK: IPFS API is accessible (Version: $VERSION)"
else
    echo "ERROR: IPFS API is not accessible"
    echo "Try: ipfs daemon"
    exit 1
fi

# Test gateway
if curl -s http://127.0.0.1:8080/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG > /dev/null; then
    echo "OK: IPFS Gateway is accessible"
else
    echo "WARNING: IPFS Gateway may not be ready yet"
fi

echo "OK: IPFS setup complete"
echo "API: http://127.0.0.1:5001"
echo "Gateway: http://127.0.0.1:8080"
