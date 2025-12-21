/**
 * Extract DPP from VC
 * 
 * Extracts the Digital Product Passport data from a decoded VC payload.
 * 
 * @license Apache-2.0
 */

import type { DigitalProductPassport } from '../untp/generateDppJsonLd';

/**
 * Extract DPP from decoded VC payload
 * 
 * @param vcPayload - Decoded VC-JWT payload
 * @returns Digital Product Passport data
 */
export function extractDppFromVc(vcPayload: any): DigitalProductPassport {
  // VC structure: { vc: { credentialSubject: { ...dpp } } }
  // or { verifiableCredential: { credentialSubject: { ...dpp } } }
  
  let credentialSubject: any;
  
  if (vcPayload.vc?.credentialSubject) {
    credentialSubject = vcPayload.vc.credentialSubject;
  } else if (vcPayload.verifiableCredential?.credentialSubject) {
    credentialSubject = vcPayload.verifiableCredential.credentialSubject;
  } else if (vcPayload.credentialSubject) {
    credentialSubject = vcPayload.credentialSubject;
  } else {
    throw new Error('No credentialSubject found in VC payload');
  }

  // credentialSubject is the DPP object
  return credentialSubject as DigitalProductPassport;
}

/**
 * Extract issuer from VC payload
 * 
 * @param vcPayload - Decoded VC-JWT payload
 * @returns Issuer DID
 */
export function extractIssuerFromVc(vcPayload: any): string {
  const vc = vcPayload.vc || vcPayload.verifiableCredential || vcPayload;
  
  if (typeof vc.issuer === 'string') {
    return vc.issuer;
  } else if (vc.issuer?.id) {
    return vc.issuer.id;
  } else if (vcPayload.iss) {
    // JWT standard claim
    return vcPayload.iss;
  }
  
  throw new Error('No issuer found in VC');
}

/**
 * Extract issuance date from VC payload
 * 
 * @param vcPayload - Decoded VC-JWT payload
 * @returns Issuance date
 */
export function extractIssuanceDateFromVc(vcPayload: any): Date {
  const vc = vcPayload.vc || vcPayload.verifiableCredential || vcPayload;
  
  if (vc.issuanceDate) {
    return new Date(vc.issuanceDate);
  } else if (vcPayload.nbf) {
    // JWT standard claim (not before)
    return new Date(vcPayload.nbf * 1000);
  } else if (vcPayload.iat) {
    // JWT standard claim (issued at)
    return new Date(vcPayload.iat * 1000);
  }
  
  throw new Error('No issuance date found in VC');
}
