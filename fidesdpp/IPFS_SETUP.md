# Optional: Pinata Setup (Convenience Only)

Pinata is not required for FIDES-DPP.

**For FOSS-only setup, see [IPFS_SETUP_FOSS.md](./IPFS_SETUP_FOSS.md) instead.**

---

This guide explains how to optionally use Pinata (a managed IPFS service) as a convenience alternative to self-hosted IPFS.

## Why Pinata is Optional

- **FOSS Primary**: FIDES-DPP works fully with Kubo (self-hosted) or Helia (embedded)
- **Pinata is Convenience**: Pinata simplifies infrastructure management but is not required

## Overview

Pinata provides hosted IPFS pinning as a SaaS. It implements the standard IPFS Pinning Services API, so you can migrate to any other PSA provider or self-hosted Kubo at any time without code changes.

## Setup Steps

### 1. Create Pinata Account

1. Visit [app.pinata.cloud](https://app.pinata.cloud/register)
2. Sign up for a free account
3. Verify your email address

### 2. Create API Key

1. Navigate to [API Keys](https://app.pinata.cloud/developers/keys)
2. Click "New Key" in the top right
3. Configure the key:
   - **Name**: Give it a descriptive name (e.g., "FIDES-DPP Development")
   - **Admin privileges**: Enable for development (you can scope it later)
   - **Unlimited uses**: Enable for development
4. Click "Create Key"
5. **Important**: Copy your **JWT** token immediately (it's only shown once!)

### 3. Get Gateway URL

1. Navigate to [Gateways](https://app.pinata.cloud/gateway)
2. You should see your default gateway listed
3. Copy the gateway domain (format: `your-gateway-name.mypinata.cloud`)
   - Example: `aquamarine-casual-tarantula-177.mypinata.cloud`

### 4. Configure Environment Variables

Create a `.env.local` file in the `fidesdpp` directory:

```env
# Select Pinata backend
IPFS_BACKEND=pinata

# Pinata credentials
PINATA_JWT=your_jwt_token_here
NEXT_PUBLIC_PINATA_GATEWAY_URL=your-gateway-name.mypinata.cloud
```

**Security Note**: 
- Never commit `.env.local` to version control
- The `PINATA_JWT` is a secret key - keep it secure
- The gateway URL is public and safe to expose

### 5. Verify Setup

1. Start the development server: `npm run dev`
2. Navigate to the DPP Contract Test page
3. Fill in the passport form
4. Enable "Enable IPFS Storage"
5. Click "Upload to IPFS"
6. You should see a success message with CID and hash

## How It Works

### Upload Flow

1. **User fills passport form** → Passport data is collected
2. **User enables IPFS** → IPFS upload component appears
3. **User clicks "Upload to IPFS"** → 
   - Client calls `/api/ipfs/upload`
   - Server creates JSON from passport data
   - Server calculates SHA-256 hash
   - Server uploads to Pinata via SDK
   - Server returns CID, hash, and gateway URL
4. **User clicks "Create Passport"** →
   - The app registers the passport on-chain with `register_passport`
   - The on-chain record anchors the dataset URI and payload hash

### Data Structure

The passport data uploaded to IPFS follows this structure:

```json
{
  "product": {
    "product_id": "PROD-001",
    "name": "Product Name",
    "description": "Product description",
    "batch_number": "BATCH-123",
    "serial_number": "SN-456"
  },
  "manufacturer": {
    "name": "Manufacturer Name",
    "identifier": "VAT-123456",
    "country": "US",
    "facility": "Facility Name"
  },
  "created_at": "2025-12-11T10:00:00.000Z"
}
```

### Hash Verification

- **Hash Algorithm**: SHA-256
- **Format**: Hex string with `0x` prefix (e.g., `0xabc123...`)
- **Purpose**: Verify data integrity when retrieving from IPFS
- **Storage**: Stored on-chain in `payload_hash` field

### CID Format

- **Format**: IPFS CID v1 (base32 encoded)
- **Example**: `bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve`
- **Storage**: Stored on-chain in `dataset_uri` field as `ipfs://<cid>`

## API Reference

### Upload Endpoint

**POST** `/api/ipfs/upload`

Request:
```json
{
  "passportData": {
    "product": { ... },
    "manufacturer": { ... }
  }
}
```

Response:
```json
{
  "cid": "bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve",
  "hash": "0xabc123...",
  "url": "https://your-gateway.mypinata.cloud/ipfs/...",
  "size": 1234
}
```

### Retrieve Endpoint

**GET** `/api/ipfs/retrieve?cid=<cid>`

Response:
```json
{
  "data": { ... },
  "hash": "0xabc123...",
  "cid": "bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve"
}
```

## Troubleshooting

### "PINATA_JWT environment variable is not set"

- Ensure `.env.local` exists in the `fidesdpp` directory
- Verify the variable name is exactly `PINATA_JWT`
- Restart the development server after adding environment variables

### "Failed to upload to IPFS"

- Check your JWT token is valid
- Verify you have sufficient Pinata credits (free tier has limits)
- Check network connectivity
- Review server logs for detailed error messages

### "Gateway URL not found"

- Verify `NEXT_PUBLIC_PINATA_GATEWAY_URL` is set correctly
- Ensure the gateway domain format is correct (no `https://` prefix)
- Check that the gateway exists in your Pinata dashboard

## Best Practices

1. **Always verify hash** when retrieving data from IPFS
2. **Use deterministic JSON** (sorted keys) for consistent hashing
3. **Store CID and hash on-chain** for integrity verification
4. **Keep JWT secure** - never expose it in client-side code
5. **Monitor Pinata usage** - free tier has rate limits

## Migration to Open-Source IPFS

If you want to migrate from Pinata to a self-hosted or embedded IPFS setup:

1. **Install Kubo or Helia** (see [IPFS_SETUP_FOSS.md](./IPFS_SETUP_FOSS.md))
2. **Change backend in `.env.local`**:
   ```bash
   IPFS_BACKEND=kubo  # or helia
   ```
3. **Restart your application**

All existing CIDs remain accessible! The backend is swappable without data migration.

## Notes

Pinata remains optional. Core flows should keep working when Pinata is disabled and a local IPFS backend is used.

## Resources

- [Pinata Documentation](https://docs.pinata.cloud)
- [Pinata Quickstart Guide](https://docs.pinata.cloud/quickstart)
- [IPFS Documentation](https://docs.ipfs.tech)
- [FOSS Setup Guide](./IPFS_SETUP_FOSS.md) - Primary recommended setup
