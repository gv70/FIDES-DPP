"use client";

import React, { useMemo, useState } from "react";

type Account = { address: string; meta: { name?: string; source: string } };

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function jsonBase64Url(obj: any) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncodeBytes(bytes);
}

export default function TestTx() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.address === selected),
    [accounts, selected]
  );

  async function connect() {
    setError("");
    const { web3Accounts, web3Enable } = await import("@polkadot/extension-dapp");
    const exts = await web3Enable("FIDES DPP - Test TX signature");
    if (!exts.length) throw new Error("Nessuna extension autorizzata");
    const accs = (await web3Accounts()) as Account[];
    setAccounts(accs);
    setSelected(accs[0]?.address ?? "");
  }

  async function signTx() {
    setError("");
    setResult(null);
    try {
      if (!selectedAccount) throw new Error("Seleziona un account");

      const { ApiPromise, WsProvider } = await import("@polkadot/api");
      const { web3FromAddress } = await import("@polkadot/extension-dapp");
      const { cryptoWaitReady, blake2AsU8a } = await import("@polkadot/util-crypto");
      const { u8aToHex } = await import("@polkadot/util");

      await cryptoWaitReady();

      // RPC Westend (puoi cambiarlo con la tua chain)
      const provider = new WsProvider("wss://westend-rpc.polkadot.io");
      const api = await ApiPromise.create({ provider });

      // Costruiamo lo stesso "signingInput" del test A (ma NON lo firmiamo come JWS)
      const header = { alg: "EdDSA", typ: "JWT", kid: "did:web:example.com#key-1" };
      const payload = {
        iss: "did:web:example.com",
        aud: "test-tx",
        iat: Math.floor(Date.now() / 1000),
        nonce: crypto.randomUUID(),
      };
      const signingInput = `${jsonBase64Url(header)}.${jsonBase64Url(payload)}`;

      // Mettiamo SOLO un hash nella remark (più corto e “pulito”)
      const hash = blake2AsU8a(new TextEncoder().encode(signingInput), 256);
      const remark = `FIDES|JWS_INPUT_BLAKE2_256|${u8aToHex(hash)}`;

      // Injector & signer dall'estensione
      const injector = await web3FromAddress(selectedAccount.address);

      // Tx di test: system.remark
      const tx = api.tx.system.remark(remark);

      // NON fare solo signAsync: fai signAndSend per forzare la UX del wallet
      const unsub = await tx.signAndSend(
        selectedAccount.address,
        { signer: injector.signer },
        ({ status, dispatchError, txHash }) => {
          console.log("status", status.toString(), "txHash", txHash.toHex());

          if (dispatchError) {
            console.error(dispatchError.toString());
          }

          // quando entra in blocco, chiudi
          if (status.isInBlock || status.isFinalized) {
            unsub();
          }
        }
      );

      const signedHex = tx.toHex();

      // Decodifica extrinsic per vedere tipo firma + remark
      const ext = api.createType("Extrinsic", signedHex);

      setResult({
        account: {
          address: selectedAccount.address,
          name: selectedAccount.meta.name,
          source: selectedAccount.meta.source,
        },
        remark,
        signedExtrinsicHex: signedHex,
        isSigned: ext.isSigned,
        signatureType: ext.isSigned ? (ext.signature as any).type ?? null : null, // Ed25519/Sr25519/Ecdsa
        signatureHex: ext.isSigned ? (ext.signature as any).toHex?.() ?? null : null,
        signer: ext.isSigned ? ext.signer.toString() : null,
        decodedCall: {
          section: ext.method.section,
          method: ext.method.method,
          args: ext.method.args.map((a: any) => a.toString()),
        },
        verifySignature: ext.isSigned ? (ext as any).verifySignature?.() ?? null : null,
      });

      await api.disconnect();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? String(e));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Test TX — firma extrinsic (remark) con Polkadot.js</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={connect}>1) Connetti extension</button>
        <button onClick={signTx} disabled={!selectedAccount}>2) Firma & invia remark su Westend</button>
      </div>

      {accounts.length > 0 && (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ width: "100%", marginBottom: 12 }}>
          {accounts.map((a) => (
            <option key={a.address} value={a.address}>
              {a.meta.name ?? "Account"} — {a.address} — source: {a.meta.source}
            </option>
          ))}
        </select>
      )}

      {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}

      {result && (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
