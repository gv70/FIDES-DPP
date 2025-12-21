'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { uploadToIPFS, type IPFSUploadResult } from '@/lib/ipfs-utils';
import { Upload, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface IPFSUploadProps {
  passportData: any;
  onUploadComplete?: (result: IPFSUploadResult) => void;
  disabled?: boolean;
}

export function IPFSUpload({ passportData, onUploadComplete, disabled }: IPFSUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<IPFSUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!passportData) {
      setError('No passport data provided');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await uploadToIPFS(passportData);
      setUploadResult(result);
      toast.success('Passport data uploaded to IPFS successfully!');
      onUploadComplete?.(result);
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to upload to IPFS';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Upload className="w-5 h-5" />
          IPFS Upload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {uploadResult ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Upload Successful</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <div className="space-y-1">
                <div className="text-sm">
                  <strong>CID:</strong>{' '}
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {uploadResult.cid}
                  </code>
                </div>
                <div className="text-sm">
                  <strong>Hash:</strong>{' '}
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                    {uploadResult.hash}
                  </code>
                </div>
                <div className="text-sm">
                  <strong>Size:</strong> {uploadResult.size} bytes
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(uploadResult.url, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View on Gateway
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(uploadResult.cid);
                    toast.success('CID copied to clipboard!');
                  }}
                >
                  Copy CID
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Upload passport data to IPFS before registering on-chain. This will store the full
              passport data off-chain and return a CID and hash for on-chain storage.
            </p>
            <Button
              onClick={handleUpload}
              disabled={uploading || disabled || !passportData}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading to IPFS...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload to IPFS
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
