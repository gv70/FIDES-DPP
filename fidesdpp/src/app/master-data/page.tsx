'use client';

import { useState } from 'react';
import { AccountInfo } from '@/components/account-info';
import { IssuerRegistration } from '@/components/issuer-registration';
import { IssuerVerification } from '@/components/issuer-verification';
import { IssuerAuthorizedAccounts } from '@/components/issuer-authorized-accounts';
import { BalanceInsufficientAlert } from '@/components/shared/balance-insufficient-alert';
import { NonMappedAccountAlert } from '@/components/shared/non-mapped-account-alert';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function MasterDataPage() {
  const [issuerModalOpen, setIssuerModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  return (
    <div className="space-y-6 w-full max-w-full">
      <BalanceInsufficientAlert />
      <NonMappedAccountAlert />
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold">Master Data</h1>
      </div>

      <div id="account-info">
        <AccountInfo />
      </div>

      {/* Issuer Management Section */}
      <div id="issuer" className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Issuer Management (did:web)</h2>
        </div>

        <IssuerAuthorizedAccounts />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registration Card */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Registration</h3>
              </div>
              <Dialog open={issuerModalOpen} onOpenChange={setIssuerModalOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    Register
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Register Issuer</DialogTitle>
                  </DialogHeader>
                  <IssuerRegistration noCard />
                </DialogContent>
              </Dialog>
            </div>
            <IssuerRegistration />
          </div>

          {/* Verification Card */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Verification</h3>
              </div>
              <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Verify
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Verify Issuer</DialogTitle>
                  </DialogHeader>
                  <IssuerVerification noCard />
                </DialogContent>
              </Dialog>
            </div>
            <IssuerVerification />
          </div>
        </div>
      </div>
    </div>
  );
}
