import { getPassportRenderData } from '@/lib/render/getPassportRenderData';
import RenderPassportClient from './render-passport-client';

export const dynamic = 'force-dynamic';

export default async function RenderPassportPage(props: {
  params: Promise<{ tokenId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tokenId } = await props.params;
  const searchParams = (await props.searchParams) || {};

  const keyRaw = searchParams.key;
  const previewRaw = searchParams.previewDte || searchParams.preview;
  const versionRaw = searchParams.version || searchParams.v;

  const verifyKey = Array.isArray(keyRaw) ? keyRaw[0] : keyRaw;
  const previewDteId = Array.isArray(previewRaw) ? previewRaw[0] : previewRaw;
  const versionStr = Array.isArray(versionRaw) ? versionRaw[0] : versionRaw;
  const requestedVersion =
    versionStr && Number.isFinite(Number(versionStr)) ? Number(versionStr) : undefined;

  let data: Awaited<ReturnType<typeof getPassportRenderData>> | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getPassportRenderData({
      tokenId,
      verifyKey,
      requestedVersion,
      previewDteId,
    });
  } catch (e: any) {
    errorMessage = String(e?.message || e || 'Unknown error');
  }

  if (errorMessage || !data) {
    return (
      <div className='mx-auto max-w-5xl p-6 space-y-3'>
        <div className='text-xl font-semibold'>Unable to render passport</div>
        <div className='text-sm text-muted-foreground'>
          Token ID: <code>{tokenId}</code>
        </div>
        <pre className='rounded-lg border p-3 text-sm whitespace-pre-wrap'>{errorMessage || 'Unknown error'}</pre>
      </div>
    );
  }

  return <RenderPassportClient data={data} />;
}
