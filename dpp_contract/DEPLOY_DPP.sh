#!/bin/bash

# Simple helper to deploy the FIDES DPP contract to Westend Asset Hub.
# Meant for local / test usage with cargo-contract v6+.

set -e

# rust-lld path - adjust if needed for your system
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/aarch64-apple-darwin/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RPC_URL="wss://westend-asset-hub-rpc.polkadot.io"
EXPLORER_URL="https://assethub-westend.subscan.io"

echo -e "${BLUE}FIDES DPP Contract Deployment${NC}"
echo ""

echo -e "${YELLOW}Building contract...${NC}"
if cargo contract build --release; then
    echo -e "${GREEN}Build ok.${NC}"
else
    echo -e "${RED}Build failed${NC}"
    exit 1
fi
echo ""

echo "Contract artifacts:"
echo "  target/ink/dpp_contract.contract"
echo "  target/ink/dpp_contract.wasm"
echo "  target/ink/dpp_contract.json"
echo ""

# NOTE: this is meant for test accounts only.
# Passing --suri on the command line exposes the seed to 'ps' etc.
# Do NOT use production seeds with this script.
read -sp "Enter your seed phrase: " SEED_PHRASE
echo ""
echo ""

echo "Network: Westend Asset Hub"
echo "RPC: $RPC_URL"
echo ""

echo -e "${YELLOW}Deploying contract...${NC}"
echo ""

# NOTE: --suri exposes seed to command line (visible in ps, logs)
# Use test accounts only, never production seeds
cargo contract upload \
  --suri "$SEED_PHRASE" \
  --url "$RPC_URL" \
  --skip-dry-run \
  --storage-deposit-limit 50000000000 \
  -x

echo ""
echo -e "${GREEN}Code upload sent.${NC}"
echo ""

# NOTE: --suri exposes seed to command line (visible in ps, logs)
# Use test accounts only, never production seeds
cargo contract instantiate \
  --suri "$SEED_PHRASE" \
  --url "$RPC_URL" \
  --constructor new \
  --gas 750000000000 \
  --proof-size 150000 \
  --storage-deposit-limit 50000000000 \
  --skip-dry-run \
  -x

echo ""
echo -e "${GREEN}Deployment complete${NC}"
echo ""
echo "Copy the contract address from the output above."
echo ""

CONTRACT_FILE=".fides_dpp_contract"
if [ -f "$CONTRACT_FILE" ]; then
    CURRENT_ADDR=$(cat "$CONTRACT_FILE" | tr -d '[:space:]')
    echo "Current contract: $CURRENT_ADDR"
    echo ""
fi

read -p "Enter new contract address to save (or Enter to keep current): " NEW_CONTRACT_ADDRESS

if [ -n "$NEW_CONTRACT_ADDRESS" ]; then
    NEW_CONTRACT_ADDRESS=$(echo "$NEW_CONTRACT_ADDRESS" | tr -d '[:space:]')
    
    if [ -n "$NEW_CONTRACT_ADDRESS" ] && [[ "$NEW_CONTRACT_ADDRESS" == 0x* ]]; then
        echo "$NEW_CONTRACT_ADDRESS" > "$CONTRACT_FILE"
        echo -e "${GREEN}Contract address saved to $CONTRACT_FILE${NC}"
    else
        echo -e "${RED}Address does not look valid, not saving.${NC}"
        echo -e "${YELLOW}You can change it later in $CONTRACT_FILE or from INTERACT_DPP.sh.${NC}"
    fi
else
    echo -e "${YELLOW}Keeping current address.${NC}"
    echo -e "${YELLOW}You can change it later in $CONTRACT_FILE or from INTERACT_DPP.sh.${NC}"
fi

echo ""
echo "Verify deployment at: $EXPLORER_URL"
echo "Run ./INTERACT_DPP.sh to interact with the contract"
echo ""
