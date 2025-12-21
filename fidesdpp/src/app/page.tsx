import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Fides DPP Platform</h1>
        <p className="text-muted-foreground mt-2">
          Create, manage, and verify Digital Product Passports anchored on-chain and linked to off-chain datasets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Master Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Wallet, issuer identity, and configuration.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/master-data">
              Open Master Data
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passport Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Create, update, revoke, and transfer passports.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/passports">
              Open Passport Management
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Verify integrity by token ID and open the rendered view.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/verification">
              Open Verification
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Deploy a contract and run contract-level utilities.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/administration#deploy">
              Open Contract Deployment
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="text-sm text-muted-foreground">
        If you are testing without a domain, use <Link className="underline underline-offset-4" href="/test">Sandbox Test Mode</Link>.
      </div>
    </div>
  );
}
