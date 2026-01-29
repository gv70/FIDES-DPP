'use client';

import { DppContractTest } from '@/components/dpp-contract-test';
import { DppDeploy } from '@/components/dpp-deploy';

export default function AdministrationPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold">Administration</h1>
      </div>

      <div id="deploy">
        <DppDeploy />
      </div>

      <div id="test">
        <DppContractTest />
      </div>
    </div>
  );
}
