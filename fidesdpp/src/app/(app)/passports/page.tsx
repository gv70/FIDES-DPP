'use client';

import { useEffect, useState } from 'react';
import { PassportList } from '@/components/passport-list';
import { DppHybridCreate } from '@/components/dpp-hybrid-create';
import { PassportUpdateModal } from '@/components/passport-update-modal';
import { PassportRevokeModal } from '@/components/passport-revoke-modal';
import { PassportTransferModal } from '@/components/passport-transfer-modal';
import { BalanceInsufficientAlert } from '@/components/shared/balance-insufficient-alert';
import { NonMappedAccountAlert } from '@/components/shared/non-mapped-account-alert';
import { Button } from '@/components/ui/button';
import { Plus, Edit, XCircle, ArrowRightLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePilotContext } from '@/hooks/use-pilot-context';

export default function PassportsPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const { pilotDid, pilotId, clearPilot } = usePilotContext();

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === '#create') setCreateModalOpen(true);
      if (hash === '#update') setUpdateModalOpen(true);
      if (hash === '#revoke') setRevokeModalOpen(true);
      if (hash === '#transfer') setTransferModalOpen(true);
    };

    // Next.js navigation to a URL that only differs by hash does not always
    // trigger the native `hashchange` event. Ensure the handler runs by also
    // dispatching `hashchange` when history state changes the hash.
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    const wrapHistory =
      (fn: typeof window.history.pushState) =>
      (...args: Parameters<typeof window.history.pushState>) => {
        const before = window.location.hash;
        const res = fn(...args);
        const after = window.location.hash;
        if (before !== after) {
          window.dispatchEvent(new Event('hashchange'));
        }
        return res;
      };

    window.history.pushState = wrapHistory(originalPushState);
    window.history.replaceState = wrapHistory(originalReplaceState);

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  const clearHashIf = (expected: string) => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== expected) return;
    const url = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="space-y-6">
      <BalanceInsufficientAlert />
      <NonMappedAccountAlert />
      {pilotDid && (
        <Alert className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20">
          <AlertTitle>Pilot Mode active</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <div className="text-sm">
              Using pilot issuer DID for create/update: <code>{pilotDid}</code>
              {pilotId ? (
                <>
                  {' '}(<span className="text-muted-foreground">pilotId</span> <code>{pilotId}</code>)
                </>
              ) : null}
            </div>
            <div>
              <Button type="button" size="sm" variant="outline" onClick={() => clearPilot()}>
                Clear Pilot Mode
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold">Passport Management</h1>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Dialog
          open={createModalOpen}
          onOpenChange={(open) => {
            setCreateModalOpen(open);
            if (!open) clearHashIf('#create');
          }}
        >
          <DialogTrigger asChild>
            <Button id="create">
              <Plus className="h-4 w-4 mr-2" />
              Create Passport
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-6xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Digital Product Passport</DialogTitle>
            </DialogHeader>
            <DppHybridCreate
              noCard
              initialIssuerDid={pilotDid || undefined}
              lockIssuerDid={!!pilotDid}
            />
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          onClick={() => {
            window.location.hash = '#update';
            setUpdateModalOpen(true);
          }}
        >
          <Edit className="h-4 w-4 mr-2" />
          Update Passport
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            window.location.hash = '#revoke';
            setRevokeModalOpen(true);
          }}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Revoke Passport
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            window.location.hash = '#transfer';
            setTransferModalOpen(true);
          }}
        >
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Transfer Passport
        </Button>
      </div>

      {/* Passport List */}
      <div id="list">
        <PassportList />
      </div>

      {/* Update Modal */}
      <PassportUpdateModal
        open={updateModalOpen}
        onOpenChange={(open) => {
          setUpdateModalOpen(open);
          if (!open) clearHashIf('#update');
        }}
        initialIssuerDid={pilotDid || undefined}
        lockIssuerDid={!!pilotDid}
        onSuccess={() => {
          // Optionally refresh the list
        }}
      />

      {/* Revoke Modal */}
      <PassportRevokeModal
        open={revokeModalOpen}
        onOpenChange={(open) => {
          setRevokeModalOpen(open);
          if (!open) clearHashIf('#revoke');
        }}
        onSuccess={() => {
          // Optionally refresh the list
        }}
      />

      <PassportTransferModal
        open={transferModalOpen}
        onOpenChange={(open) => {
          setTransferModalOpen(open);
          if (!open) clearHashIf('#transfer');
        }}
        onSuccess={() => {
          // Optionally refresh the list
        }}
      />
    </div>
  );
}
