import { notFound } from 'next/navigation';
import { SandboxTestPage } from '@/components/sandbox-test-page';

function isTestMode(): boolean {
  return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
}

export default function TestModePage() {
  if (!isTestMode()) {
    notFound();
  }

  return <SandboxTestPage />;
}
