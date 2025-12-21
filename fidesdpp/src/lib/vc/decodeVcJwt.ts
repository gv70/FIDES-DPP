/**
 * Decode VC-JWT
 * 
 * Decodes a VC-JWT into its payload without verification.
 * Use for extracting data after signature verification has been done.
 * 
 * @license Apache-2.0
 */

/**
 * Decode VC-JWT to extract payload
 * 
 * @param vcJwt - VC-JWT string (header.payload.signature)
 * @returns Decoded VC payload
 */
export function decodeVcJwt(vcJwt: string): any {
  // JWT structure: header.payload.signature
  const parts = vcJwt.split('.');
  
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: expected 3 parts (header.payload.signature)');
  }

  try {
    // Decode payload (base64url)
    const payloadBase64Url = parts[1];
    
    // Convert base64url to base64
    const payloadBase64 = payloadBase64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Decode base64 to string
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    
    // Parse JSON
    const payload = JSON.parse(payloadJson);
    
    return payload;
  } catch (error: any) {
    throw new Error(`Failed to decode VC-JWT: ${error.message}`);
  }
}

/**
 * Decode VC-JWT header
 * 
 * @param vcJwt - VC-JWT string
 * @returns Decoded JWT header
 */
export function decodeVcJwtHeader(vcJwt: string): any {
  const parts = vcJwt.split('.');
  
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  try {
    const headerBase64Url = parts[0];
    const headerBase64 = headerBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const headerJson = Buffer.from(headerBase64, 'base64').toString('utf-8');
    return JSON.parse(headerJson);
  } catch (error: any) {
    throw new Error(`Failed to decode JWT header: ${error.message}`);
  }
}
