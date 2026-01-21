import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Product Passports</h1>
        <p className="text-muted-foreground mt-2">
          Create and share product passports your customers can verify in seconds—without needing technical knowledge.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Connect your account and set up your issuing organization.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/master-data">
              Open Setup
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Passports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Create, update, invalidate, and transfer product passports.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/passports">
              Open Passports
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Verify authenticity by passport ID and open the customer view.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/verification">
              Open Verification
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product History Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Record manufacturing, inspection, packaging, and shipping events linked to a passport.</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/traceability">
              Open History Events
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advanced (Infrastructure)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Deployment and low-level utilities (for technical teams).</div>
            <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/administration#deploy">
              Open Advanced Tools
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
