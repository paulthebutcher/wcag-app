import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { Button } from './ui/primitives';

export function ScanReportDownload({ siteId, scanId }: { siteId: string; scanId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/sites/${siteId}/scans/${scanId}/report.pdf`);
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? 'The report could not be downloaded. Try again.');
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('application/pdf') || (await blob.slice(0, 5).text()) !== '%PDF-') {
        throw new Error('The engine did not return a PDF. Try again after the report is ready.');
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scan-${scanId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="report-download">
      <Button variant="outline" disabled={pending} onClick={() => void download()}>
        {pending ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
        {pending ? 'Preparing PDF…' : 'Download scan PDF'}
      </Button>
      {error && (
        <p className="text-error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
