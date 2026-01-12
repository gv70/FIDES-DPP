/**
 * API route for uploading passport data to IPFS
 * POST /api/ipfs/upload
 * Body: { passportData: object }
 * Returns: { cid: string, hash: string, url: string }
 * 
 * Uses configurable backend (Kubo, Helia, or optional Pinata)
 * Backend selection via IPFS_BACKEND environment variable
 * 
 * @license Apache-2.0
 */

import { NextResponse, type NextRequest } from "next/server";
import { createIpfsBackend } from "@/lib/ipfs/IpfsStorageFactory";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { passportData } = body;

    if (!passportData || typeof passportData !== "object") {
      return NextResponse.json(
        { error: "Invalid passport data. Expected an object." },
        { status: 400 }
      );
    }

    // Create backend (factory selects based on IPFS_BACKEND env var)
    const backend = createIpfsBackend();
    
    // Check if backend is available
    const isAvailable = await backend.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        { 
          error: `IPFS backend (${backend.getBackendType()}) is not available. Check configuration.`,
          hint: backend.getBackendType() === 'kubo' 
            ? 'Make sure Kubo daemon is running: ipfs daemon'
            : backend.getBackendType() === 'pinata'
            ? 'Check PINATA_JWT and NEXT_PUBLIC_PINATA_GATEWAY_URL environment variables'
            : 'Check Helia dependencies are installed'
        },
        { status: 503 }
      );
    }

    // Upload to IPFS via configured backend
    const result = await backend.uploadJson(passportData, {
      name: `dpp-${passportData.product?.product_id || 'passport'}.json`,
      keyvalues: {
        'product-id': passportData.product?.product_id || '',
        'type': 'digital-product-passport',
      }
    });

    return NextResponse.json(
      {
        cid: result.cid,
        hash: result.hash,
        url: result.gatewayUrl,
        size: result.size,
        backend: backend.getBackendType(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("IPFS upload error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
