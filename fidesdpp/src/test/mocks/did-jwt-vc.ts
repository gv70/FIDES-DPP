type CreateVcIssuer = {
  did: string;
  alg?: string;
  signer?: (data: string) => Promise<string>;
};

type VerifyCredentialResult = {
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  verifiableCredential: any;
  jwtPayload?: any;
};

function base64UrlEncodeJson(input: unknown): string {
  const json = JSON.stringify(input);
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeJson<T>(input: string): T {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

export async function createVerifiableCredentialJwt(
  vc: any,
  issuer: CreateVcIssuer,
  options?: { exp?: number; jti?: string }
): Promise<string> {
  const header = {
    alg: issuer.alg || 'EdDSA',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer.did,
    nbf: now,
    ...(options?.exp ? { exp: options.exp } : {}),
    ...(options?.jti ? { jti: options.jti } : {}),
    vc,
  };

  // Note: this is a non-cryptographic stub for unit tests only.
  return `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}.signature`;
}

export async function verifyCredential(
  vcJwt: string,
  _resolver: unknown,
  _options?: { audience?: string }
): Promise<VerifyCredentialResult> {
  const [headerB64, payloadB64] = vcJwt.split('.');
  if (!headerB64 || !payloadB64) {
    throw new Error('Invalid JWT format');
  }

  const payload = base64UrlDecodeJson<any>(payloadB64);

  return {
    issuer: payload.iss,
    issuanceDate: new Date((payload.nbf || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    expirationDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
    verifiableCredential: payload.vc,
    jwtPayload: payload,
  };
}

