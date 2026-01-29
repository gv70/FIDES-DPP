'use client';

import { Suspense } from 'react';
import { DppVerify } from '@/components/dpp-verify';

export default function VerificationPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold">Verify this product</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Confirm the passport matches its digital proof, then open the customer view.
        </p>
      </div>

      {/* Verification Component */}
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <DppVerify />
      </Suspense>
    </div>
  );
}
