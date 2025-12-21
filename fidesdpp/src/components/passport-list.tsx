'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTypink } from 'typink';
import { Loader2, Eye, Edit, XCircle, Search } from 'lucide-react';
import { useContractAddress } from '@/hooks/use-contract-address';
import type { OnChainPassport } from '@/lib/chain/ChainAdapter';
import Link from 'next/link';
import { PassportUpdateModal } from '@/components/passport-update-modal';
import { PassportRevokeModal } from '@/components/passport-revoke-modal';
import { decodeAddress, keccakAsU8a } from '@polkadot/util-crypto';

interface PassportListItem {
  tokenId: string;
  passport: OnChainPassport & { owner?: string };
}

export function PassportList() {
  const { network, connectedAccount } = useTypink();
  const { activeAddress: contractAddress } = useContractAddress();
  const [passports, setPassports] = useState<PassportListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [startId, setStartId] = useState('0');
  const [endId, setEndId] = useState('100');
  const [searchTokenId, setSearchTokenId] = useState('');
  const [pageOffset, setPageOffset] = useState(0);
  const [pageLimit, setPageLimit] = useState(50);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  const [updateTokenId, setUpdateTokenId] = useState<string | null>(null);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  const normalizeH160 = (value: string): string => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return '';
    if (!v.startsWith('0x')) return v;
    return `0x${v.slice(2).padStart(40, '0')}`;
  };

  const accountToH160 = (address: string): string => {
    const bytes = decodeAddress(address);
    if (bytes.length === 20) {
      return normalizeH160(`0x${Buffer.from(bytes).toString('hex')}`);
    }
    if (bytes.length === 32) {
      const hash = keccakAsU8a(bytes, 256);
      const h160 = hash.slice(12); // last 20 bytes
      return normalizeH160(`0x${Buffer.from(h160).toString('hex')}`);
    }
    throw new Error(`Unsupported address length: ${bytes.length}`);
  };

  const isIssuerMatch = (issuer: string, accountAddress: string): boolean => {
    const issuerH160 = normalizeH160(issuer);
    if (!issuerH160.startsWith('0x') || issuerH160.length !== 42) return false;
    if (!accountAddress) return false;
    try {
      const accountH160 = accountToH160(accountAddress);
      return issuerH160 === accountH160;
    } catch {
      return false;
    }
  };

  const refreshList = async () => {
    if (pageTotal != null) {
      await loadAll(pageOffset);
      return;
    }
    if (passports.length === 1 && searchTokenId) {
      await searchPassport();
      return;
    }
    await loadPassports();
  };

  const getRpcUrl = (): string | undefined => {
    const providers = network?.providers || [];
    return providers.find(p => p.startsWith('wss://') || p.startsWith('ws://'));
  };

  const loadAll = async (offset = 0) => {
    if (!contractAddress) {
      setError('Contract address not available');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const url = new URL('/api/passports/list', window.location.origin);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(pageLimit));
      url.searchParams.set('contractAddress', contractAddress);
      const rpcUrl = getRpcUrl();
      if (rpcUrl) url.searchParams.set('rpcUrl', rpcUrl);

      const response = await fetch(url.toString(), { method: 'GET' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to list passports');
      }

      setPassports(data.items || []);
      setPageOffset(data.pagination?.offset ?? offset);
      setPageLimit(data.pagination?.limit ?? pageLimit);
      setPageTotal(data.pagination?.total ?? null);
    } catch (e: any) {
      setError(e.message || 'Failed to list passports');
      setPassports([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPassports = async () => {
    if (!contractAddress) {
      setError('Contract address not available');
      return;
    }

    setIsLoading(true);
    setError('');
    setPassports([]);

    try {
      const response = await fetch('/api/passports/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startId,
          endId,
          rpcUrl: getRpcUrl() || '',
          contractAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to scan passports');
      }

      setPassports(data.passports || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load passports');
    } finally {
      setIsLoading(false);
    }
  };

  const searchPassport = async () => {
    if (!searchTokenId || !contractAddress) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/passports/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: searchTokenId,
          rpcUrl: getRpcUrl() || '',
          contractAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 404) {
          setError('Passport not found');
        } else {
          setError(data.error || 'Passport not found');
        }
        setPassports([]);
        return;
      }

      setPassports([{ tokenId: searchTokenId, passport: data.passport }]);
    } catch (e: any) {
      setError(e.message || 'Passport not found');
      setPassports([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'text-green-600 dark:text-green-400';
      case 'Revoked':
        return 'text-red-600 dark:text-red-400';
      case 'Suspended':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passport List</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>All Passports</Label>
            <div className="flex gap-2 mt-1 items-center">
              <Input
                type="number"
                min={1}
                max={200}
                value={pageLimit}
                onChange={(e) => setPageLimit(Math.max(1, Math.min(200, Number(e.target.value || 50))))}
                className="max-w-[140px]"
              />
              <Button onClick={() => loadAll(0)} disabled={isLoading || !contractAddress}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load All'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => loadAll(Math.max(0, pageOffset - pageLimit))}
                disabled={isLoading || pageOffset <= 0}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                onClick={() => loadAll(pageOffset + pageLimit)}
                disabled={isLoading || pageTotal == null || pageOffset + pageLimit >= pageTotal}
              >
                Next
              </Button>
              {pageTotal != null && (
                <div className="text-xs text-muted-foreground">
                  Showing {pageOffset}–{Math.min(pageOffset + pageLimit, pageTotal) - 1} of {pageTotal - 1} (nextTokenId={pageTotal})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search by Token ID */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="search-token-id">Search by Token ID</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="search-token-id"
                type="text"
                placeholder="Enter token ID"
                value={searchTokenId}
                onChange={(e) => setSearchTokenId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPassport()}
              />
              <Button onClick={searchPassport} disabled={isLoading || !searchTokenId}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>
          </div>
        </div>

        {/* Scan Range */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="start-id">Start ID</Label>
            <Input
              id="start-id"
              type="number"
              value={startId}
              onChange={(e) => setStartId(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="end-id">End ID</Label>
            <Input
              id="end-id"
              type="number"
              value={endId}
              onChange={(e) => setEndId(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button onClick={loadPassports} disabled={isLoading || !contractAddress}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Scan Range'
            )}
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {/* Results Table */}
        {passports.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Token ID</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Issuer</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Owner</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Granularity</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Version</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {passports.map(({ tokenId, passport }) => (
                  <tr key={tokenId} className="border-t">
                    <td className="px-4 py-2 font-mono text-sm">{tokenId}</td>
                    <td className="px-4 py-2 text-sm font-mono">{passport.issuer.substring(0, 10)}...</td>
                    <td className="px-4 py-2 text-sm font-mono">
                      {passport.owner ? `${passport.owner.substring(0, 10)}...` : '-'}
                    </td>
                    <td className={`px-4 py-2 text-sm font-medium ${getStatusColor(passport.status)}`}>
                      {passport.status}
                    </td>
                    <td className="px-4 py-2 text-sm">{passport.granularity}</td>
                    <td className="px-4 py-2 text-sm">{passport.version}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <Link href={`/verification?tokenId=${tokenId}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {(() => {
                          const canManage =
                            !!connectedAccount &&
                            isIssuerMatch(passport.issuer, connectedAccount.address) &&
                            passport.status !== 'Revoked';

                          const canRevoke =
                            !!connectedAccount &&
                            isIssuerMatch(passport.issuer, connectedAccount.address) &&
                            passport.status !== 'Revoked';

                          return (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canManage}
                                onClick={() => setUpdateTokenId(tokenId)}
                                title={canManage ? 'Update passport' : 'Only the issuer can update'}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canRevoke}
                                onClick={() => setRevokeTokenId(tokenId)}
                                title={canRevoke ? 'Revoke passport' : 'Only the issuer can revoke'}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && passports.length === 0 && !error && (
          <div className="text-center text-muted-foreground py-8">
            No passports found. Use search or scan range to find passports.
          </div>
        )}

        <PassportUpdateModal
          open={updateTokenId != null}
          tokenId={updateTokenId || undefined}
          onOpenChange={(open) => setUpdateTokenId(open ? updateTokenId : null)}
          onSuccess={refreshList}
        />

        <PassportRevokeModal
          open={revokeTokenId != null}
          tokenId={revokeTokenId || undefined}
          onOpenChange={(open) => setRevokeTokenId(open ? revokeTokenId : null)}
          onSuccess={refreshList}
        />
      </CardContent>
    </Card>
  );
}

