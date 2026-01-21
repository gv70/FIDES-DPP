/**
 * Minimal jose mock for Jest (CommonJS test runtime)
 *
 * The real `jose` package is ESM-only. Our unit tests don't need full JOSE
 * crypto; they just need module imports to succeed and a few helpers to exist.
 *
 * @license Apache-2.0
 */

export async function importJWK(_jwk: any, _alg?: string): Promise<any> {
  return {};
}

export class SignJWT {
  constructor(_payload: any) {}
  setProtectedHeader(_header: any) {
    return this;
  }
  setIssuer(_issuer: string) {
    return this;
  }
  setJti(_jti: string) {
    return this;
  }
  setIssuedAt(_iat?: number) {
    return this;
  }
  setNotBefore(_nbf?: number) {
    return this;
  }
  setExpirationTime(_exp: number) {
    return this;
  }
  async sign(_key: any): Promise<string> {
    return 'mock.jwt.signature';
  }
}

export async function jwtVerify(_jwt: string, _key: any, _options?: any): Promise<any> {
  return { payload: {}, protectedHeader: {} };
}

