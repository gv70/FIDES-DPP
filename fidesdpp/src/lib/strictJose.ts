import { compactVerify, importJWK } from "jose";
import { decodeAddress } from "@polkadot/util-crypto";

function base64Url(bytes: Uint8Array) {
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function strictJoseVerify(jws: string, ss58: string) {
  const pub = decodeAddress(ss58);
  const jwk = { kty: "OKP", crv: "Ed25519", x: base64Url(pub) } as const;

  const key = await importJWK(jwk, "EdDSA");
  const { protectedHeader, payload } = await compactVerify(jws, key);

  return {
    protectedHeader,
    payloadJson: JSON.parse(new TextDecoder().decode(payload)),
  };
}



