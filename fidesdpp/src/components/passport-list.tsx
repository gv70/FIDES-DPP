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
import type { IssuerDirectoryEntry } from '@/lib/issuer/issuer-directory';
import { normalizeH160 } from '@/lib/issuer/issuer-directory';

interface PassportListItem {
  tokenId: string;
  productId?: string;
  passport: OnChainPassport & { owner?: string };
}

export function PassportList() {
  const { network, connectedAccount } = useTypink();
  const { activeAddress: contractAddress } = useContractAddress();
  const [passports, setPassports] = useState<PassportListItem[]>([]);
  const [filters, setFilters] = useState<{
    granularity: 'All' | 'ProductClass' | 'Batch' | 'Item';
    owner: string;
    issuer: string;
  }>({
    granularity: 'All',
    owner: '',
    issuer: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [startId, setStartId] = useState('0');
  const [endId, setEndId] = useState('100');
  const [searchTokenId, setSearchTokenId] = useState('');
  const [productLookup, setProductLookup] = useState<{
    productId: string;
    granularity: 'ProductClass' | 'Batch' | 'Item';
    batchNumber: string;
    serialNumber: string;
  }>({
    productId: '',
    granularity: 'ProductClass',
    batchNumber: '',
    serialNumber: '',
  });
  const [productLookupBusy, setProductLookupBusy] = useState(false);
  const [productLookupError, setProductLookupError] = useState<string>('');
  const [pageOffset, setPageOffset] = useState(0);
  const [pageLimit, setPageLimit] = useState(50);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  const [updateTokenId, setUpdateTokenId] = useState<string | null>(null);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);
  const [issuerDirectory, setIssuerDirectory] = useState<IssuerDirectoryEntry[]>([]);

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

  const loadIssuerDirectory = async () => {
    try {
      const resp = await fetch('/api/issuer/directory', { method: 'GET' });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success || !Array.isArray(json.issuers)) {
        setIssuerDirectory([]);
        return;
      }
      setIssuerDirectory(json.issuers as IssuerDirectoryEntry[]);
    } catch {
      setIssuerDirectory([]);
    }
  };

  const resolveIssuerLabel = (issuerH160Raw: string): string | null => {
    const issuerH160 = normalizeH160(issuerH160Raw);
    if (!issuerH160) return null;
    for (const issuer of issuerDirectory) {
      if (Array.isArray(issuer.issuerH160s) && issuer.issuerH160s.includes(issuerH160)) {
        return issuer.organizationName || issuer.domain || issuer.did;
      }
    }
    return null;
  };

  const resolveOwnerAlias = (ownerAddress: string): string | null => {
    const owner = String(ownerAddress || '').trim();
    if (!owner) return null;

    if (connectedAccount?.address && owner === connectedAccount.address) {
      return 'You';
    }

    for (const issuer of issuerDirectory) {
      const accounts = Array.isArray((issuer as any).authorizedAccounts) ? ((issuer as any).authorizedAccounts as string[]) : [];
      if (accounts.includes(owner)) {
        return issuer.organizationName || issuer.domain || issuer.did || 'Authorized operator';
      }
    }

    return null;
  };

  const formatUnknownOwner = (ownerAddress: string): string => {
    const owner = String(ownerAddress || '').trim();
    if (!owner) return '—';
    const head = owner.slice(0, 4);
    const tail = owner.slice(-4);
    return `User ${head}…${tail}`;
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

    await loadIssuerDirectory();
    setIsLoading(true);
    setError('');

    try {
      const url = new URL('/api/passports/list', window.location.origin);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(pageLimit));
      url.searchParams.set('resolveProductId', '1');
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

    await loadIssuerDirectory();
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
          resolveProductId: true,
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

  const readPassportByTokenId = async (tokenId: string) => {
    const normalized = String(tokenId || '').trim();
    if (!normalized || !contractAddress) {
      return;
    }

    setIsLoading(true);
    setError('');
    setProductLookupError('');

    try {
      const response = await fetch('/api/passports/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: normalized,
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

      setSearchTokenId(normalized);
      setPassports([{ tokenId: normalized, passport: data.passport, productId: data.productId }]);
      setPageTotal(null);
    } catch (e: any) {
      setError(e.message || 'Passport not found');
      setPassports([]);
    } finally {
      setIsLoading(false);
    }
  };

  const searchPassport = async () => {
    await readPassportByTokenId(searchTokenId);
  };

  const findByProductId = async () => {
    if (!contractAddress) return;
    setProductLookupBusy(true);
    setProductLookupError('');
    setError('');

    try {
      const body: any = {
        productId: productLookup.productId.trim(),
        granularity: productLookup.granularity,
        contractAddress,
        rpcUrl: getRpcUrl() || '',
      };
      if (productLookup.granularity === 'Batch') body.batchNumber = productLookup.batchNumber.trim();
      if (productLookup.granularity === 'Item') body.serialNumber = productLookup.serialNumber.trim();

      const res = await fetch('/api/passports/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Lookup failed');
      }
      if (!json?.found || !json?.tokenId) {
        setProductLookupError('No passport found for this product identifier.');
        return;
      }

      const foundTokenId = String(json.tokenId);
      await readPassportByTokenId(foundTokenId);
    } catch (e: any) {
      setProductLookupError(e?.message || 'Lookup failed');
    } finally {
      setProductLookupBusy(false);
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

  const visiblePassports = passports.filter(({ passport }) => {
    if (filters.granularity !== 'All' && passport.granularity !== filters.granularity) {
      return false;
    }

    if (filters.owner.trim()) {
      const needle = filters.owner.trim().toLowerCase();
      const hay = String(passport.owner || '').toLowerCase();
      if (!hay.includes(needle)) return false;
    }

    if (filters.issuer.trim()) {
      const needle = filters.issuer.trim().toLowerCase();
      const issuerLabel = resolveIssuerLabel(passport.issuer);
      const hay = `${issuerLabel || ''} ${passport.issuer || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }

    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passports</CardTitle>
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
                  Showing {pageOffset}–{Math.min(pageOffset + pageLimit, pageTotal) - 1} of {pageTotal - 1} (nextPassportId={pageTotal})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search by Passport ID */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="search-token-id">Search by Passport ID</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="search-token-id"
                type="text"
                placeholder="Enter passport ID"
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

        {/* Search by Product Identifier */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>Search by Product Identifier (SKU/GTIN)</Label>
            <div className="mt-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input
                  placeholder="e.g., GTIN:0123456789012"
                  value={productLookup.productId}
                  onChange={(e) => setProductLookup((p) => ({ ...p, productId: e.target.value }))}
                  disabled={isLoading || productLookupBusy}
                  onKeyDown={(e) => e.key === 'Enter' && void findByProductId()}
                  className="md:col-span-2"
                />
                <select
                  className="w-full h-10 rounded-md border border-gray-200 dark:border-gray-800 bg-background px-3 text-sm"
                  value={productLookup.granularity}
                  onChange={(e) =>
                    setProductLookup((p) => ({
                      ...p,
                      granularity: e.target.value as any,
                      batchNumber: '',
                      serialNumber: '',
                    }))
                  }
                  disabled={isLoading || productLookupBusy}
                >
                  <option value="ProductClass">Model / SKU</option>
                  <option value="Batch">Batch / Lot</option>
                  <option value="Item">Serialized item</option>
                </select>
              </div>

              {productLookup.granularity === 'Batch' && (
                <Input
                  placeholder="Batch / Lot number (required)"
                  value={productLookup.batchNumber}
                  onChange={(e) => setProductLookup((p) => ({ ...p, batchNumber: e.target.value }))}
                  disabled={isLoading || productLookupBusy}
                  onKeyDown={(e) => e.key === 'Enter' && void findByProductId()}
                />
              )}

              {productLookup.granularity === 'Item' && (
                <Input
                  placeholder="Serial number (required)"
                  value={productLookup.serialNumber}
                  onChange={(e) => setProductLookup((p) => ({ ...p, serialNumber: e.target.value }))}
                  disabled={isLoading || productLookupBusy}
                  onKeyDown={(e) => e.key === 'Enter' && void findByProductId()}
                />
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => void findByProductId()}
                  disabled={
                    isLoading ||
                    productLookupBusy ||
                    !contractAddress ||
                    !productLookup.productId.trim() ||
                    (productLookup.granularity === 'Batch' && !productLookup.batchNumber.trim()) ||
                    (productLookup.granularity === 'Item' && !productLookup.serialNumber.trim())
                  }
                >
                  <Search className="h-4 w-4 mr-2" />
                  {productLookupBusy ? 'Searching...' : 'Find'}
                </Button>
                {searchTokenId ? (
                  <Link href={`/verification?tokenId=${encodeURIComponent(searchTokenId)}`} className="inline-flex">
                    <Button variant="outline" disabled={!searchTokenId}>
                      <Eye className="h-4 w-4 mr-2" />
                      Verify
                    </Button>
                  </Link>
                ) : null}
              </div>

              {productLookupError ? (
                <div className="text-sm text-red-600 dark:text-red-400">{productLookupError}</div>
              ) : null}
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Granularity</Label>
                <select
                  className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                  value={filters.granularity}
                  onChange={(e) => setFilters((prev) => ({ ...prev, granularity: e.target.value as any }))}
                >
                  <option value="All">All</option>
                  <option value="ProductClass">ProductClass</option>
                  <option value="Batch">Batch</option>
                  <option value="Item">Item</option>
                </select>
              </div>

              <div className="min-w-[220px] flex-1">
                <Label>Issuer</Label>
                <Input
                  className="mt-1"
                  placeholder="Search by issuer name or address…"
                  value={filters.issuer}
                  onChange={(e) => setFilters((prev) => ({ ...prev, issuer: e.target.value }))}
                />
              </div>

              <div className="min-w-[220px] flex-1">
                <Label>Owner</Label>
                <Input
                  className="mt-1"
                  placeholder="Search by owner address…"
                  value={filters.owner}
                  onChange={(e) => setFilters((prev) => ({ ...prev, owner: e.target.value }))}
                />
              </div>

              <Button variant="outline" onClick={() => setFilters({ granularity: 'All', owner: '', issuer: '' })}>
                Clear filters
              </Button>

              <div className="text-xs text-muted-foreground">
                Showing {visiblePassports.length} of {passports.length}
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Passport ID</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Product ID</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Issuer</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Owner</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Granularity</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Version</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePassports.map(({ tokenId, passport, productId }) => (
                  <tr key={tokenId} className="border-t">
                    <td className="px-4 py-2 font-mono text-sm">{tokenId}</td>
                    <td className="px-4 py-2 text-sm">
                      {productId ? (
                        <div className="truncate max-w-[320px]" title={productId}>
                          {productId}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">—</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {resolveIssuerLabel(passport.issuer) ? (
                        <div className="space-y-1">
                          <div className="font-medium">{resolveIssuerLabel(passport.issuer)}</div>
                          <div className="text-xs text-muted-foreground font-mono" title="Technical reference (advanced)">
                            {passport.issuer.substring(0, 10)}...
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono">{passport.issuer.substring(0, 10)}...</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {passport.owner ? (
                        resolveOwnerAlias(passport.owner) ? (
                          <div className="space-y-1">
                            <div className="font-medium">{resolveOwnerAlias(passport.owner)}</div>
                            <div className="text-xs text-muted-foreground font-mono" title="Technical reference (advanced)">
                              {passport.owner.substring(0, 10)}...
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono">{formatUnknownOwner(passport.owner)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
