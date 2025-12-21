"use client";

import React, { useState } from "react";
import { useTypink } from 'typink';
import { strictJoseVerify } from "@/lib/strictJose";
import nacl from "tweetnacl";
import { u8aWrapBytes, hexToU8a } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";

function base64UrlEncodeBytes(bytes: Uint8Array) {
  // browser-safe base64url
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  const b64 = btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return b64;
}

// helper: decode base64url -> Uint8Array (per check firma nel JWT)
function b64urlToU8a(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function jsonBase64Url(obj: any) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncodeBytes(bytes);
}

export default function TestA() {
  const { accounts, connectedAccount } = useTypink();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  async function signRemarkOnly() {
    setError("");
    setResult(null);
    try {
      console.log("signRemarkOnly: Inizio");
      
      if (!connectedAccount) {
        throw new Error("Connetti un wallet usando il pulsante in alto a destra");
      }

      console.log("signRemarkOnly: Account connesso:", connectedAccount.address);

      const { ApiPromise, WsProvider } = await import("@polkadot/api");

      // Bypass web3Enable: usa direttamente window.injectedWeb3
      const injectedWeb3 = (window as any).injectedWeb3;
      console.log("signRemarkOnly: Injected keys:", Object.keys(injectedWeb3 || {}));

      // Prova a trovare il wallet corretto (polkadot-js, subwallet-js, talisman, ecc.)
      const accountSource = (connectedAccount as any).meta?.source || (connectedAccount as any).wallet || "polkadot-js";
      const walletKey = accountSource === "polkadot-js" ? "polkadot-js" : 
                       accountSource === "subwallet-js" ? "subwallet-js" :
                       accountSource === "talisman" ? "talisman" : "polkadot-js";
      
      const ext = injectedWeb3?.[walletKey];
      if (!ext) {
        const available = Object.keys(injectedWeb3 || {}).join(", ");
        throw new Error(`Wallet "${walletKey}" non trovato in window.injectedWeb3. Disponibili: ${available || "nessuno"}`);
      }

      console.log("signRemarkOnly: Chiamando ext.enable()...");
      const injected = await Promise.race([
	        ext.enable("FIDES DPP - Test A (signRaw)"),
	        new Promise((_, rej) => setTimeout(() => rej(new Error(
	          "enable() timeout. Apri l'estensione → Settings → Manage Website Access e verifica localhost."
	        )), 8000))
	      ]);
      console.log("signRemarkOnly: ext.enable() completato");

      // injected.signer e injected.accounts ora sono disponibili
      const signer = injected.signer;
      console.log("signRemarkOnly: Signer ottenuto:", !!signer);

      console.log("signRemarkOnly: Connessione a Westend...");
      const ws = new WsProvider("wss://westend-rpc.polkadot.io");
      const api = await ApiPromise.create({ provider: ws });
      console.log("signRemarkOnly: API creata");

      // tx semplice, non la inviamo: firmiamo e basta
      const tx = api.tx.system.remark("FIDES:DIDweb TestA signOnly");

      console.log("signRemarkOnly: Richiedo firma transazione (signOnly)...");
      const signed = await tx.signAsync(connectedAccount.address, { signer });
      console.log("Transazione firmata:", signed.toHex());

      // MultiSignature (hex)
      const signatureHex = signed.signature.toHex();

      const result = {
        signer: signed.signer.toString(),
        signatureHex,
        txHex: signed.toHex(),
      };

      console.log("signRemarkOnly: Impostando risultato");
      setResult(result);
      await api.disconnect();
      console.log("signRemarkOnly: Completato con successo");
    } catch (e: any) {
      console.error("signRemarkOnly: Errore catturato:", e);
      setError(e?.message ?? String(e));
    }
  }

  async function runTest() {
    setError("");
    setResult(null);
    try {
      console.log("runTest: Inizio");
      
      if (!connectedAccount) {
        throw new Error("Connetti un wallet usando il pulsante in alto a destra");
      }

      console.log("runTest: Account connesso:", connectedAccount.address);

      const { stringToHex, hexToU8a, u8aToHex } = await import("@polkadot/util");
      const { cryptoWaitReady, decodeAddress, signatureVerify } = await import("@polkadot/util-crypto");

      // Bypass web3Enable: usa direttamente window.injectedWeb3
      const injectedWeb3 = (window as any).injectedWeb3;
      console.log("runTest: Injected keys:", Object.keys(injectedWeb3 || {}));

      // Prova a trovare il wallet corretto (polkadot-js, subwallet-js, talisman, ecc.)
      const accountSource = (connectedAccount as any).meta?.source || (connectedAccount as any).wallet || "polkadot-js";
      const walletKey = accountSource === "polkadot-js" ? "polkadot-js" : 
                       accountSource === "subwallet-js" ? "subwallet-js" :
                       accountSource === "talisman" ? "talisman" : "polkadot-js";
      
      const ext = injectedWeb3?.[walletKey];
      if (!ext) {
        const available = Object.keys(injectedWeb3 || {}).join(", ");
        throw new Error(`Wallet "${walletKey}" non trovato in window.injectedWeb3. Disponibili: ${available || "nessuno"}`);
      }

      console.log("runTest: Chiamando ext.enable()...");
      const injected = await Promise.race([
        ext.enable("FIDES DPP - Test A (signRaw)"),
        new Promise((_, rej) => setTimeout(() => rej(new Error(
          "enable() timeout. Apri l'estensione → Settings → Manage Website Access e verifica localhost."
        )), 8000))
      ]);
      console.log("runTest: ext.enable() completato");

      // injected.signer e injected.accounts ora sono disponibili
      const signer = injected.signer;
      console.log("runTest: Signer ottenuto:", !!signer, "signRaw disponibile:", !!signer?.signRaw);

      await cryptoWaitReady(); // sr25519 verify richiede wasm pronto

      // 1) Costruiamo un finto JWS signing input
      const header = {
        alg: "EdDSA",
        typ: "JWT",
        kid: "did:web:example.com#key-1",
      };
      const payload = {
        iss: "did:web:example.com",
        aud: "test-a",
        iat: Math.floor(Date.now() / 1000),
        nonce: crypto.randomUUID(),
      };

      const signingInput = `${jsonBase64Url(header)}.${jsonBase64Url(payload)}`;

      // 2) Firma con signRaw direttamente dal signer
      if (!signer?.signRaw) {
        throw new Error("signRaw non disponibile su questo signer/estensione");
      }

      console.log("runTest: Richiedo firma signRaw...");
      const { signature } = await signer.signRaw({
        address: connectedAccount.address,
        data: stringToHex(signingInput),
        type: "bytes",
      });
      console.log("runTest: Firma ricevuta:", signature);

      // 3) Verify su RAW bytes
      const publicKey = decodeAddress(connectedAccount.address);
      const rawBytes = new TextEncoder().encode(signingInput);

      const vRaw = signatureVerify(rawBytes, signature, u8aToHex(publicKey));

      // 4) Verify su WRAPPED bytes (per capire se qualcuno wrappa <Bytes>... )
      // Nota: alcune integrazioni wrappano volutamente prima di firmare
      // Qui facciamo un wrapping "alla Substrate" minimalista: "<Bytes>" + raw + "</Bytes>"
      const prefix = new TextEncoder().encode("<Bytes>");
      const postfix = new TextEncoder().encode("</Bytes>");
      const wrappedBytes = new Uint8Array(prefix.length + rawBytes.length + postfix.length);
      wrappedBytes.set(prefix, 0);
      wrappedBytes.set(rawBytes, prefix.length);
      wrappedBytes.set(postfix, prefix.length + rawBytes.length);

      const vWrapped = signatureVerify(wrappedBytes, signature, u8aToHex(publicKey));

      // 5) Se crypto = ed25519 e vRaw true → puoi costruire un JWS "standard"
      const sigBytes = hexToU8a(signature);
      const jws = `${signingInput}.${base64UrlEncodeBytes(sigBytes)}`;

      // 5b) Verifica STRICT con nacl (usando u8aWrapBytes per wrapping Substrate)
      const pubKey = decodeAddress(connectedAccount.address);       // 32 bytes
      const sigBytes2 = hexToU8a(signature);                        // 64 bytes
      const rawBytes2 = new TextEncoder().encode(signingInput);
      const wrapped2 = u8aWrapBytes(rawBytes2);

      // 1) Verify STRICT raw vs wrapped
      const rawStrictOk = nacl.sign.detached.verify(rawBytes2, sigBytes2, pubKey);
      const wrappedStrictOk = nacl.sign.detached.verify(wrapped2, sigBytes2, pubKey);

      // 2) Check che la signature nel JWS sia davvero quella che pensi
      const jwtSigSeg = jws.split(".")[2];
      const jwtSigBytes = b64urlToU8a(jwtSigSeg);
      const jwsSigMatchesHex = (jwtSigBytes.length === sigBytes2.length) &&
        jwtSigBytes.every((b, i) => b === sigBytes2[i]);

      console.log("STRICT nacl verify raw:", rawStrictOk);
      console.log("STRICT nacl verify wrapped:", wrappedStrictOk);
      console.log("sig len:", sigBytes2.length, "raw len:", rawBytes2.length, "wrapped len:", wrapped2.length);
      console.log("JWS signature segment matches signatureHex bytes:", jwsSigMatchesHex);

      // 6) Verifica JWS con jose (strict verification)
      console.log("runTest: Verifica JWS con jose...");
      let joseVerification = null;
      try {
        joseVerification = await strictJoseVerify(jws, connectedAccount.address);
        console.log("runTest: Verifica jose completata:", joseVerification);
      } catch (e: any) {
        console.error("runTest: Errore verifica jose:", e);
        joseVerification = { error: e?.message ?? String(e) };
      }

      console.log("runTest: Verifica completata, impostando risultato");
      setResult({
        account: { 
          address: connectedAccount.address, 
          name: connectedAccount.name, 
          source: (connectedAccount as any).meta?.source || (connectedAccount as any).wallet 
        },
        signingInput,
        signingInputHex: stringToHex(signingInput),
        signatureHex: signature,
        verifyRaw: { isValid: vRaw.isValid, crypto: vRaw.crypto },
        verifyWrapped: { isValid: vWrapped.isValid, crypto: vWrapped.crypto },
        jwsIfYouWantIt: jws,
        joseVerification,
        strict: {
          rawStrictOk,
          wrappedStrictOk,
          sigLen: sigBytes2.length,
          jwsSigMatchesHex,
        },
      });
      console.log("runTest: Completato con successo");
    } catch (e: any) {
      console.error("runTest: Errore catturato:", e);
      setError(e?.message ?? String(e));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Test A — signRaw vs JWS raw input</h1>

      {!connectedAccount && (
        <div style={{ padding: 12, background: "#fff3cd", borderRadius: 4, marginBottom: 12, border: "1px solid #ffc107" }}>
          <strong>Connetti un wallet:</strong> Usa il pulsante "Connect Wallet" in alto a destra per connettere il tuo wallet.
        </div>
      )}

      {connectedAccount && (
        <div style={{ padding: 8, background: "#d4edda", borderRadius: 4, marginBottom: 12, border: "1px solid #28a745" }}>
          <strong>Wallet connesso:</strong> {connectedAccount.name} ({connectedAccount.address.substring(0, 10)}...)
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button 
          onClick={() => {
            console.log("Button clicked: signRemarkOnly, connectedAccount:", !!connectedAccount);
            if (!connectedAccount) {
              setError("Connetti un wallet usando il pulsante 'Connect Wallet' in alto a destra");
              return;
            }
            signRemarkOnly();
          }} 
          style={{ 
            padding: "8px 16px", 
            cursor: "pointer", 
            borderRadius: "4px", 
            border: "1px solid #ccc",
            backgroundColor: connectedAccount ? "#fff" : "#f0f0f0",
            opacity: connectedAccount ? 1 : 0.6
          }}
        >
          Step 1: Firma remark (sign-only)
        </button>
        <button 
          onClick={() => {
            console.log("Button clicked: runTest, connectedAccount:", !!connectedAccount);
            if (!connectedAccount) {
              setError("Connetti un wallet usando il pulsante 'Connect Wallet' in alto a destra");
              return;
            }
            runTest();
          }} 
          style={{ 
            padding: "8px 16px", 
            cursor: "pointer", 
            borderRadius: "4px", 
            border: "1px solid #ccc",
            backgroundColor: connectedAccount ? "#fff" : "#f0f0f0",
            opacity: connectedAccount ? 1 : 0.6
          }}
        >
          2) Firma & verifica
        </button>
      </div>

      {error && <div style={{ color: "crimson", marginBottom: 12, padding: 8, background: "#ffe6e6", borderRadius: 4 }}>{error}</div>}

      {result && (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
