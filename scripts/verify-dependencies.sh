#!/bin/bash

# Dependency Verification Script
# Validates that lockfiles / docker-compose versions match DEPENDENCIES.md entries
# Warnings only (does not fail build)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIDESDPP_DIR="$REPO_ROOT/fidesdpp"
DEPENDENCIES_FILE="$REPO_ROOT/DEPENDENCIES.md"
DPP_CONTRACT_DIR="$REPO_ROOT/dpp_contract"

WARNINGS=0

echo "Verifying dependencies match DEPENDENCIES.md..."
echo ""

# Check if DEPENDENCIES.md exists
if [ ! -f "$DEPENDENCIES_FILE" ]; then
        echo "ERROR: DEPENDENCIES.md not found at $DEPENDENCIES_FILE"
    exit 1
fi

# Check if Node lockfile exists (source of truth for resolved versions)
if [ ! -f "$FIDESDPP_DIR/package-lock.json" ]; then
    echo "ERROR: package-lock.json not found at $FIDESDPP_DIR/package-lock.json"
    exit 1
fi

echo "Checking Node.js dependencies (from fidesdpp/package-lock.json)..."

# Key dependencies to verify (from DEPENDENCIES.md)
# Note: Avoid bash associative arrays for macOS /bin/bash compatibility.
EXPECTED_LIST=$(
    cat <<'EOF'
did-jwt-vc 4.0.16
did-resolver 4.1.0
dedot 1.0.2
typink 0.6.0
ajv 8.17.1
ajv-formats 3.0.1
@4sure-tech/vc-bitstring-status-lists 0.1.0
next 16.0.8
react 19.2.1
react-dom 19.2.1
@polkadot/api 16.5.4
@polkadot/util-crypto 14.0.1
pinata 2.5.1
pg 8.16.3
@types/pg 8.16.0
typescript 5.9.3
tsx 4.21.0
eslint 9.39.1
prettier 3.7.4
tailwindcss 4.1.17
jest 30.2.0
EOF
)

if ! command -v node >/dev/null 2>&1; then
    echo "WARNING: 'node' not found; cannot verify fidesdpp/package-lock.json versions"
    ((WARNINGS++))
else
    while read -r DEP_NAME EXPECTED_VER; do
        [ -z "$DEP_NAME" ] && continue

        LOCKED_VER=$(node -e "const lock=require('${FIDESDPP_DIR}/package-lock.json'); const p=lock.packages||{}; const key='node_modules/${DEP_NAME}'; process.stdout.write(p[key]?.version||'NOT_FOUND');")

        if [ "$LOCKED_VER" = "NOT_FOUND" ]; then
            echo "WARNING: $DEP_NAME not found in fidesdpp/package-lock.json"
            ((WARNINGS++))
            continue
        fi

        if [ "$LOCKED_VER" != "$EXPECTED_VER" ]; then
            echo "WARNING: $DEP_NAME version mismatch - locked: $LOCKED_VER, expected: $EXPECTED_VER"
            ((WARNINGS++))
        else
            echo "OK: $DEP_NAME: $LOCKED_VER"
        fi
    done <<<"$EXPECTED_LIST"
fi

echo ""
echo "Checking Docker image versions..."

# Check docker-compose.yml for 'latest' tags
if grep -q "image:.*:latest" "$REPO_ROOT/docker-compose.yml" 2>/dev/null; then
    echo "WARNING: Found 'latest' tag in docker-compose.yml (should pin versions)"
    ((WARNINGS++))
else
    echo "OK: All Docker images are pinned (no 'latest' tags)"
fi

# Verify specific image versions
if grep -q "ipfs/kubo:v0.31.0" "$REPO_ROOT/docker-compose.yml"; then
    echo "OK: Kubo image pinned to v0.31.0"
else
    echo "WARNING: Kubo image version not found or changed"
    ((WARNINGS++))
fi

if grep -q "waltid/issuer-api:1.2.0" "$REPO_ROOT/docker-compose.yml"; then
    echo "OK: walt.id image pinned to 1.2.0"
else
    echo "WARNING: walt.id image version not found or changed"
    ((WARNINGS++))
fi

if grep -q "postgres:16-alpine" "$REPO_ROOT/docker-compose.yml"; then
    echo "OK: PostgreSQL image pinned to 16-alpine"
else
    echo "WARNING: PostgreSQL image version not found or changed"
    ((WARNINGS++))
fi

echo ""
echo "Checking documentation completeness..."

# Check if DEPENDENCIES.md has template section
if grep -q "## Template" "$DEPENDENCIES_FILE"; then
    echo "OK: DEPENDENCIES.md has template section"
else
    echo "WARNING: DEPENDENCIES.md missing template section"
    ((WARNINGS++))
fi

# Check if THIRD_PARTY_NOTICES.md has template section
if grep -q "## Template" "$REPO_ROOT/THIRD_PARTY_NOTICES.md"; then
    echo "OK: THIRD_PARTY_NOTICES.md has template section"
else
    echo "WARNING: THIRD_PARTY_NOTICES.md missing template section"
    ((WARNINGS++))
fi

# Check if TESTING_GUIDE.md has dependency verification section
if grep -q "Dependency Verification" "$REPO_ROOT/docs/TESTING_GUIDE.md"; then
    echo "OK: TESTING_GUIDE.md has Dependency Verification section"
else
    echo "WARNING: TESTING_GUIDE.md missing Dependency Verification section"
    ((WARNINGS++))
fi

# Check if FOSS-only mode is documented
if grep -qE "FOSS-only|walt.id.*optional|USE_WALT_ID=false" "$DEPENDENCIES_FILE"; then
    echo "OK: Optional dependencies documented (open-source-only mode)"
else
    echo "WARNING: Open-source-only mode not clearly documented"
    ((WARNINGS++))
fi

# Rust contract checks
echo ""
echo "Checking Rust contract dependencies (from dpp_contract/Cargo.lock)..."

if [ ! -f "$DPP_CONTRACT_DIR/Cargo.lock" ]; then
    echo "WARNING: dpp_contract/Cargo.lock not found"
    ((WARNINGS++))
else
    INK_VER=$(awk 'BEGIN{f=0} /^name = \"ink\"$/{f=1} f && /^version = /{gsub(/\"/,"",$3); print $3; exit}' "$DPP_CONTRACT_DIR/Cargo.lock" || true)
    SCALE_VER=$(awk 'BEGIN{f=0} /^name = \"parity-scale-codec\"$/{f=1} f && /^version = /{gsub(/\"/,"",$3); print $3; exit}' "$DPP_CONTRACT_DIR/Cargo.lock" || true)

    if [ "$INK_VER" = "6.0.0-beta" ]; then
        echo "OK: ink: $INK_VER"
    else
        echo "WARNING: ink version mismatch - locked: ${INK_VER:-NOT_FOUND}, expected: 6.0.0-beta"
        ((WARNINGS++))
    fi

    if [ "$SCALE_VER" = "3.7.5" ]; then
        echo "OK: parity-scale-codec: $SCALE_VER"
    else
        echo "WARNING: parity-scale-codec version mismatch - locked: ${SCALE_VER:-NOT_FOUND}, expected: 3.7.5"
        ((WARNINGS++))
    fi
fi

echo ""
if [ $WARNINGS -eq 0 ]; then
    echo "OK: All dependency checks passed."
    exit 0
else
    echo "Found $WARNINGS warning(s) - see output above."
    exit 0  # Exit 0 even with warnings (non-blocking)
fi
