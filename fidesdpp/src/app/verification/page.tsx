'use client';

import { Suspense } from 'react';
import { DppVerify } from '@/components/dpp-verify';

export default function VerificationPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold">Verification</h1>
      </div>

      {/* Verification Component */}
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <DppVerify />
      </Suspense>
    </div>
  );
}

