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
    echo "  DPP OPS:"
    echo ""
    echo "    1) Mint new DPP token"
    echo "    2) Get full DPP data"
    echo "    3) Get product information"
    echo "    4) Get manufacturer info"
    echo "    5) Get materials list"
    echo "    6) Get passport status"
    echo ""
    echo "  NFT OPS:"
    echo ""
    echo "    10) Check balance of address"
    echo "    11) Get token owner"
    echo "    12) Transfer token"
    echo "    13) Approve token transfer"
    echo "    14) Burn token"
    echo ""
    echo "  Contract details:"
    echo ""
    echo "    15) Get DPP authority (who can update)"
    echo "    16) Get contract admin"
    echo "    17) Get next token ID"
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
            # NOTE: --suri exposes seed to command line (visible in ps, logs)
            # Use test accounts only, never production seeds
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            echo ""
            read -p "Product ID: " PRODUCT_ID
            read -p "Product Name: " PRODUCT_NAME
            read -p "Description: " DESCRIPTION
            read -p "Manufacturer Name: " MANUFACTURER_NAME
            read -p "Manufacturer ID: " MANUFACTURER_ID
            read -p "Facility Name: " FACILITY_NAME
            read -p "Country Code: " COUNTRY_CODE
            read -p "Batch Number (or Enter for None): " BATCH_NUMBER
            read -p "Serial Number (or Enter for None): " SERIAL_NUMBER
            
            # Ensure empty strings if not provided (contract converts empty to None)
            BATCH_NUMBER="${BATCH_NUMBER:-}"
            SERIAL_NUMBER="${SERIAL_NUMBER:-}"
            
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message mint_simple \
              --args "\"$PRODUCT_ID\"" "\"$PRODUCT_NAME\"" "\"$DESCRIPTION\"" "\"$MANUFACTURER_NAME\"" "\"$MANUFACTURER_ID\"" "\"$FACILITY_NAME\"" "\"$COUNTRY_CODE\"" "\"$BATCH_NUMBER\"" "\"$SERIAL_NUMBER\"" \
              --suri "$SEED_PHRASE" \
              --url "$RPC_URL" \
              --gas 10000000000 \
              --proof-size 200000 \
              --storage-deposit-limit 100000000000 \
              -x
            
            echo -e "${GREEN}Mint submitted${NC}"
            read -p "Enter to continue..."
            ;;

        2)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message read_passport \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        3)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_product_info \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        4)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_manufacturer \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        5)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_materials \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        6)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_status \
              --args "$TOKEN_ID" \
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
            # NOTE: --suri exposes seed to command line (visible in ps, logs)
            # Use test accounts only, never production seeds
            read -sp "Insert your seed phrase: " SEED_PHRASE
            echo ""
            read -p "Token ID to burn: " TOKEN_ID
            echo -e "${RED}Warning: This will permanently destroy the token${NC}"
            read -p "Are you sure? (yes/no): " CONFIRM
            if [ "$CONFIRM" = "yes" ]; then
                cargo contract call \
                  --contract "$CONTRACT_ADDRESS" \
                  --message burn \
                  --args "$TOKEN_ID" \
                  --suri "$SEED_PHRASE" \
                  --url "$RPC_URL" \
                  --skip-confirm \
                  --gas 10000000000 \
                  --proof-size 200000 \
                  --storage-deposit-limit 100000000000 \
                  -x
                echo -e "${GREEN}Token burned${NC}"
            else
                echo "Cancelled"
            fi
            read -p "Enter to continue..."
            ;;

        15)
            read -p "Token ID: " TOKEN_ID
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_dpp_authority \
              --args "$TOKEN_ID" \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        16)
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_admin \
              --suri //Alice \
              --url "$RPC_URL" \
              --output-json
            read -p "Enter to continue..."
            ;;

        17)
            cargo contract call \
              --contract "$CONTRACT_ADDRESS" \
              --message get_next_token_id \
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
