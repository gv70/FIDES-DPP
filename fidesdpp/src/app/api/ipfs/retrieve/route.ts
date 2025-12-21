/**
 * API route for retrieving passport data from IPFS
 * GET /api/ipfs/retrieve?cid=<cid>
 * Returns: { data: object, hash: string }
 * 
 * Uses configurable backend (Kubo, Helia, or optional Pinata)
 * Backend selection via IPFS_BACKEND environment variable
 * 
 * @license Apache-2.0
 */

import { NextResponse, type NextRequest } from "next/server";
import { createIpfsBackend } from "@/lib/ipfs/IpfsStorageFactory";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cid = searchParams.get("cid");

    if (!cid) {
      return NextResponse.json(
        { error: "CID parameter is required" },
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
            ? 'Check PINATA_JWT and PINATA_GATEWAY_URL environment variables'
            : 'Check Helia dependencies are installed'
        },
        { status: 503 }
      );
    }

    // Retrieve from IPFS via configured backend
    const result = await backend.retrieveJson(cid);

    return NextResponse.json(
      {
        data: result.data,
        hash: result.hash,
        cid: result.cid,
        backend: backend.getBackendType(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("IPFS retrieve error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
