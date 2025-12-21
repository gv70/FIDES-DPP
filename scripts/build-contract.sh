#!/bin/bash
# Build the ink! contract (v0.2)
# Usage: ./scripts/build-contract.sh [release|debug]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/../dpp_contract"

echo "FIDES-DPP contract build"

# Check if we're in the right directory
if [ ! -f "$CONTRACT_DIR/Cargo.toml" ]; then
    echo "ERROR: Contract directory not found: $CONTRACT_DIR"
    exit 1
fi

cd "$CONTRACT_DIR"

# Check Rust installation
if ! command -v rustc &> /dev/null; then
    echo "ERROR: Rust is not installed"
    echo "Install: https://rustup.rs"
    exit 1
fi

echo "OK: $(rustc --version)"

# Check cargo-contract
if ! command -v cargo-contract &> /dev/null; then
    echo "ERROR: cargo-contract is not installed"
    echo "Install: cargo install cargo-contract --force --locked"
    exit 1
fi

echo "OK: $(cargo contract --version)"

# Check wasm32 target
if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "INFO: Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
    echo "OK: wasm32-unknown-unknown target installed"
else
    echo "OK: wasm32-unknown-unknown target installed"
fi

# Check llvm-tools
if ! rustup component list --installed | grep -q llvm-tools; then
    echo "INFO: Installing llvm-tools-preview..."
    rustup component add llvm-tools-preview
    echo "OK: llvm-tools-preview installed"
else
    echo "OK: llvm-tools-preview installed"
fi

# Check for linker config
if [ ! -f ".cargo/config.toml" ]; then
    echo "INFO: Creating .cargo/config.toml..."
    
    mkdir -p .cargo
    
    # Find rust-lld
    RUST_LLD=$(find ~/.rustup -name rust-lld 2>/dev/null | head -1)
    
    if [ -z "$RUST_LLD" ]; then
        echo "ERROR: rust-lld not found"
        echo "Try: rustup component add llvm-tools-preview"
        exit 1
    fi
    
    cat > .cargo/config.toml << EOF
[build]
target = "wasm32-unknown-unknown"

[target.wasm32-unknown-unknown]
rustflags = [
    "-C", "link-arg=--export-table",
    "-C", "link-arg=--import-memory",
    "-C", "link-arg=--initial-memory=1048576",
]

[target.wasm32-unknown-unknown]
linker = "$RUST_LLD"
EOF
    
    echo "OK: Created .cargo/config.toml"
fi

# Build mode
BUILD_MODE="${1:-release}"

if [ "$BUILD_MODE" == "debug" ]; then
    echo "INFO: Building (debug)..."
    cargo contract build
else
    echo "INFO: Building (release)..."
    cargo contract build --release
fi

# Check build artifacts
if [ -f "target/ink/dpp_contract.contract" ]; then
    CONTRACT_SIZE=$(du -h target/ink/dpp_contract.contract | cut -f1)
    WASM_SIZE=$(du -h target/ink/dpp_contract.wasm 2>/dev/null | cut -f1 || echo "N/A")
    
    echo "OK: Build successful"
    echo "Artifacts:"
    echo "  target/ink/dpp_contract.contract ($CONTRACT_SIZE)"
    if [ "$WASM_SIZE" != "N/A" ]; then
        echo "  target/ink/dpp_contract.wasm ($WASM_SIZE)"
    fi
    echo "  target/ink/dpp_contract.json"
    
    # Check if contract file should be copied to frontend
    FRONTEND_CONTRACT="$SCRIPT_DIR/../fidesdpp/src/contracts/artifacts/dpp_contract/dpp_contract.contract.json"
    if [ -d "$(dirname "$FRONTEND_CONTRACT")" ]; then
        echo "INFO: Copying metadata to frontend..."
        cp target/ink/dpp_contract.json "$FRONTEND_CONTRACT"
        echo "OK: Copied to: $FRONTEND_CONTRACT"
    fi
else
    echo "ERROR: Build failed (target/ink/dpp_contract.contract not found)"
    exit 1
fi
