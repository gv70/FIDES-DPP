#!/bin/bash

# Helper script to interact with the FIDES DPP contract on Westend Asset Hub.
# Intended for local/test usage with cargo-contract.

set -e

# If we're in the repo root, move into the contract dir.
if [ ! -f "lib.rs" ] && [ -d "dpp_contract" ]; then
  cd dpp_contract
fi

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Config
CONTRACT_FILE=".fides_dpp_contract"
RPC_URL="wss://westend-asset-hub-rpc.polkadot.io"

# Load contract address from file, or use default
load_contract_address() {
    if [ -f "$CONTRACT_FILE" ]; then
        CONTRACT_ADDRESS=$(cat "$CONTRACT_FILE" | tr -d '[:space:]')
        if [ -z "$CONTRACT_ADDRESS" ]; then
            CONTRACT_ADDRESS=""
        fi
    else
        CONTRACT_ADDRESS=""
    fi
}

# Save contract address to file
save_contract_address() {
    echo "$1" > "$CONTRACT_FILE"
    echo -e "${GREEN}Contract address saved${NC}"
}

load_contract_address

# Interaction loop
while true; do
    clear
    echo -e "${BLUE}FIDES DPP test environment${NC}"
    echo ""
    if [ -n "$CONTRACT_ADDRESS" ]; then
        echo "Contract: $CONTRACT_ADDRESS"
    else
        echo -e "Contract: ${RED}Not set${NC} (use option 20)"
    fi
    echo "Network: Westend Asset Hub"
    echo "Select an option"
    echo ""
    echo "  ANCHOR OPS:"
    echo ""
    echo "    1) Register passport anchor"
    echo "    2) Get passport anchor"
    echo "    3) Update dataset (issuer)"
    echo "    4) Revoke passport (issuer)"
    echo "    5) Version history"
    echo "    6) Get version"
    echo "    7) Recent versions"
    echo "    8) Next token ID"
    echo ""
    echo "  NFT OPS:"
    echo ""
    echo "    10) Check balance of address"
    echo "    11) Get token owner"
    echo "    12) Transfer token"
    echo "    13) Approve token transfer"
    echo ""
    echo "  Config:"
    echo ""
    echo "    20) Change contract address"
    echo ""
    echo "    0) Exit"
    echo ""
    read -p "Enter choice: " choice
    echo ""

    if [ -z "$CONTRACT_ADDRESS" ]; then
        echo -e "${RED}No contract address configured${NC}"
        read -p "Enter contract address (or press Enter to skip): " NEW_ADDR
        if [ -n "$NEW_ADDR" ]; then
            save_contract_address "$NEW_ADDR"
            CONTRACT_ADDRESS="$NEW_ADDR"
        else
            echo -e "${RED}Need contract address to continue${NC}"
            sleep 2
            continue
        fi
    fi

    case $choice in
        1)
            # NOTE: --suri is visible to local tooling (shell history, process list).
            # Use test accounts only.
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "Dataset URI (ipfs://...): " DATASET_URI
            read -p "Payload hash (0x + 64 hex): " PAYLOAD_HASH
            read -p "Dataset type [application/vc+jwt]: " DATASET_TYPE
            DATASET_TYPE="${DATASET_TYPE:-application/vc+jwt}"
            read -p "Granularity [ProductClass|Batch|Item] (default: Batch): " GRANULARITY
            GRANULARITY="${GRANULARITY:-Batch}"
            read -p "Subject ID hash (0x + 64 hex) (or Enter for None): " SUBJECT_HASH

            if [ -n "$SUBJECT_HASH" ]; then
                SUBJECT_ARG="Some($SUBJECT_HASH)"
            else
                SUBJECT_ARG="None"
            fi

            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message register_passport \
              --args "\"$DATASET_URI\"" "$PAYLOAD_HASH" "\"$DATASET_TYPE\"" "$GRANULARITY" "$SUBJECT_ARG" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x

            echo -e "${GREEN}Registration submitted${NC}"
            read -p "Enter to continue..."
            ;;

        2)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_passport \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        3)
            # NOTE: --suri is visible to local tooling (shell history, process list).
            # Use test accounts only.
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "Token ID: " TOKEN_ID
            read -p "New dataset URI (ipfs://...): " DATASET_URI
            read -p "New payload hash (0x + 64 hex): " PAYLOAD_HASH
            read -p "Dataset type [application/vc+jwt]: " DATASET_TYPE
            DATASET_TYPE="${DATASET_TYPE:-application/vc+jwt}"
            read -p "Subject ID hash (0x + 64 hex) (or Enter for None): " SUBJECT_HASH

            if [ -n "$SUBJECT_HASH" ]; then
                SUBJECT_ARG="Some($SUBJECT_HASH)"
            else
                SUBJECT_ARG="None"
            fi

            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message update_dataset \
              --args "$TOKEN_ID" "\"$DATASET_URI\"" "$PAYLOAD_HASH" "\"$DATASET_TYPE\"" "$SUBJECT_ARG" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x

            echo -e "${GREEN}Update submitted${NC}"
            read -p "Enter to continue..."
            ;;

        4)
            # NOTE: --suri is visible to local tooling (shell history, process list).
            # Use test accounts only.
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "Token ID: " TOKEN_ID
            read -p "Reason (or Enter for None): " REASON

            if [ -n "$REASON" ]; then
                REASON_ARG="Some(\"$REASON\")"
            else
                REASON_ARG="None"
            fi

            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message revoke_passport \
              --args "$TOKEN_ID" "$REASON_ARG" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x

            echo -e "${GREEN}Revocation submitted${NC}"
            read -p "Enter to continue..."
            ;;

        5)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_version_history \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        6)
            read -p "Token ID: " TOKEN_ID
            read -p "Version (u32): " VERSION
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_version \
              --args "$TOKEN_ID" "$VERSION" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        7)
            read -p "Token ID: " TOKEN_ID
            read -p "Limit: " LIMIT
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_recent_versions \
              --args "$TOKEN_ID" "$LIMIT" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        8)
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message next_token_id \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        10)
            read -p "Account Address: " ACCOUNT_ADDRESS
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message balance_of \
              --args "$ACCOUNT_ADDRESS" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        11)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message owner_of \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        12)
            # NOTE: --suri exposes seed to command line (visible in ps, logs)
            # Use test accounts only, never production seeds
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            read -p "Token ID: " TOKEN_ID
            read -p "Recipient Address: " RECIPIENT
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message transfer \
              --args "$RECIPIENT" "$TOKEN_ID" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x
            echo -e "${GREEN}Transfer initiated${NC}"
            read -p "Enter to continue..."
            ;;

        13)
            # NOTE: --suri exposes seed to command line (visible in ps, logs)
            # Use test accounts only, never production seeds
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            read -p "Token ID: " TOKEN_ID
            read -p "Approved Address: " APPROVED_ADDRESS
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message approve \
              --args "$APPROVED_ADDRESS" "$TOKEN_ID" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x
            echo -e "${GREEN}Approval set${NC}"
            read -p "Enter to continue..."
            ;;

        14)
            # NOTE: --suri is visible to local tooling (shell history, process list).
            # Use test accounts only.
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "From (owner) address: " FROM
            read -p "To (recipient) address: " TO
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message transfer_from \
              --args "$FROM" "$TO" "$TOKEN_ID" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x
            echo -e "${GREEN}Transfer submitted${NC}"
            read -p "Enter to continue..."
            ;;

        15)
            # NOTE: --suri is visible to local tooling (shell history, process list).
            # Use test accounts only.
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "Operator address: " OPERATOR
            read -p "Approved [true|false]: " APPROVED
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message set_approval_for_all \
              --args "$OPERATOR" "$APPROVED" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --skip-confirm \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x
            echo -e "${GREEN}Operator approval set${NC}"
            read -p "Enter to continue..."
            ;;

        16)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_approved \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        17)
            read -p "Owner address: " OWNER
            read -p "Operator address: " OPERATOR
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message is_approved_for_all \
              --args "$OWNER" "$OPERATOR" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        20)
            echo "Current address: $CONTRACT_ADDRESS"
            echo ""
            read -p "New contract address (or Enter to cancel): " NEW_ADDR
            if [ -n "$NEW_ADDR" ]; then
                NEW_ADDR=$(echo "$NEW_ADDR" | tr -d '[:space:]')
                if [ -n "$NEW_ADDR" ] && [[ "$NEW_ADDR" == 0x* ]]; then
                    save_contract_address "$NEW_ADDR"
                    CONTRACT_ADDRESS="$NEW_ADDR"
                    echo -e "${GREEN}Address updated${NC}"
                else
                    echo -e "${RED}Invalid address${NC}"
                fi
            fi
            read -p "Enter to continue..."
            ;;

        0)
            echo "Bye!"
            exit 0
            ;;

        *)
            echo -e "${RED}Invalid choice${NC}"
            sleep 2
            ;;
    esac
done
