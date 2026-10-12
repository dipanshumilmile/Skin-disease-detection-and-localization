
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
).replace(/\/$/, '');

function imageUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function number(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function percent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function Metric({ label, value, suffix = '' }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">
        {value}{suffix}
      </div>
    </div>
  );
}

function ScanPanel({ title, scan }) {
  if (!scan) return null;

  const bbox = scan.bbox;

  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 break-words text-sm text-gray-500">
        {scan.fileName || 'Scan image'}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">Original image</p>
          {scan.imageUrl ? (
            <img
              src={imageUrl(scan.imageUrl)}
              alt={`${title} original`}
              className="max-h-72 w-full rounded-lg bg-gray-50 object-contain"
            />
          ) : (
            <div className="grid min-h-40 place-items-center rounded-lg bg-gray-50 text-sm text-gray-400">
              Image unavailable
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">U-Net mask</p>
          {scan.maskUrl ? (
            <img
              src={imageUrl(scan.maskUrl)}
              alt={`${title} segmentation mask`}
              className="max-h-72 w-full rounded-lg bg-gray-50 object-contain"
            />
          ) : (
            <div className="grid min-h-40 place-items-center rounded-lg bg-gray-50 text-sm text-gray-400">
              Mask unavailable
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Area (pixels)" value={number(scan.areaPixels, 0)} />
        <Metric label="Perimeter (pixels)" value={number(scan.perimeterPixels, 0)} />
        <Metric label="Bounding-box width" value={number(bbox?.width, 0)} />
        <Metric label="Bounding-box height" value={number(bbox?.height, 0)} />
      </div>
    </section>
  );
}

export default function VerifyView() {
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [currentFile, setCurrentFile] = useState(null);
  const [currentPreview, setCurrentPreview] = useState('');
  const [result, setResult] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedScan = useMemo(
    () => history.find((item) => String(item.id) === String(selectedId)),
    [history, selectedId]
  );

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);

    try {
      const response = await fetch(`${API_URL}/api/history`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`History request failed (${response.status}).`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('The history endpoint did not return a list.');
      }

      setHistory(data);

      setSelectedId((oldId) => {
        if (oldId && data.some((item) => String(item.id) === String(oldId))) {
          return oldId;
        }
        return data.length ? String(data[0].id) : '';
      });

      setError('');
    } catch (err) {
      console.error(err);
      setError(
        `${err.message} Make sure FastAPI is running and GET /api/history is available.`
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Allow the History view to open Verify with a selected scan.
  useEffect(() => {
    function handleOpenVerify(event) {
      const detail = event?.detail || {};
      const id =
        detail.scanId ??
        detail.historyId ??
        detail.historyItem?.id ??
        detail.scan?.id;

      if (id !== undefined && id !== null) {
        setSelectedId(String(id));
      }

      setResult(null);
      setNotice('');
      loadHistory();
    }

    window.addEventListener('open-verify', handleOpenVerify);

    return () => {
      window.removeEventListener('open-verify', handleOpenVerify);
    };
  }, [loadHistory]);

  useEffect(() => {
    return () => {
      if (currentPreview.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreview);
      }
    };
  }, [currentPreview]);

  function selectFile(file) {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WEBP image.');
      return;
    }

    if (currentPreview.startsWith('blob:')) {
      URL.revokeObjectURL(currentPreview);
    }

    setCurrentFile(file);
    setCurrentPreview(URL.createObjectURL(file));
    setResult(null);
    setError('');
    setNotice('');
  }

  async function handleCompare(event) {
    event.preventDefault();

    if (!selectedScan) {
      setError('Select a previous scan from history first.');
      return;
    }

    if (!currentFile) {
      setError('Choose the current image first.');
      return;
    }

    setLoadingCompare(true);
    setError('');
    setNotice('');
    setResult(null);

    try {
      const form = new FormData();
      form.append('previous_scan_id', String(selectedScan.id));
      form.append('current_image', currentFile);

      const response = await fetch(`${API_URL}/api/compare`, {
        method: 'POST',
        body: form,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Comparison request failed (${response.status}).`
        );
      }

      if (data.status !== 'success' || !data.current || !data.comparison) {
        throw new Error(data.message || 'The backend did not return comparison results.');
      }

      setResult(data);
      setNotice('Comparison completed. The new scan was saved to history.');

      // The backend creates a new Scan record for the uploaded image.
      await loadHistory();


    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not compare these images.');
    } finally {
      setLoadingCompare(false);
    }
  }

  const comparison = result?.comparison;

  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">
          Verify & Compare
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Compare saved localization measurements with a newly uploaded image.
        </p>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This tool displays model-generated image localization, not a medical
        diagnosis. Pixel measurements can change with image scale, framing,
        lighting, and image alignment.
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <form onSubmit={handleCompare} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="previous-scan" className="mb-2 block text-sm font-medium text-gray-800">
            Previous scan
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="previous-scan"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setResult(null);
                setError('');
                setNotice('');
              }}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 p-2.5 text-sm"
              disabled={loadingHistory || history.length === 0}
            >
              {history.length === 0 && <option value="">No saved scans found</option>}
              {history.map((scan) => (
                <option key={scan.id} value={String(scan.id)}>
                  #{scan.id} — {scan.fileName || 'Unnamed scan'}
                  {scan.createdAt ? ` (${new Date(scan.createdAt).toLocaleString()})` : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadHistory}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh history
            </button>
          </div>
        </div>

        {selectedScan && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            Selected: <strong>{selectedScan.fileName}</strong>
            {' · '}Area: {number(selectedScan.areaPixels, 0)} pixels
          </div>
        )}

        <div>
          <label htmlFor="current-image" className="mb-2 block text-sm font-medium text-gray-800">
            Current image
          </label>
          <input
            id="current-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => selectFile(event.target.files?.[0])}
            className="block w-full text-sm text-gray-700"
          />
        </div>

        {currentPreview && (
          <div className="max-w-md">
            <p className="mb-1 text-xs font-medium text-gray-500">Current image preview</p>
            <img
              src={currentPreview}
              alt="Current upload preview"
              className="max-h-72 w-full rounded-lg bg-gray-50 object-contain"
            />
            <p className="mt-1 break-words text-xs text-gray-500">{currentFile?.name}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loadingCompare || loadingHistory || !selectedScan || !currentFile}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingCompare ? 'Running U-Net and comparing…' : 'Compare scans'}
        </button>
      </form>

      {result && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Comparison results</h3>
            <p className="text-sm text-gray-600">{result.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric label="Area change" value={percent(comparison?.areaChangePercent)} />
            <Metric label="Width change" value={percent(comparison?.widthChangePercent)} />
            <Metric label="Height change" value={percent(comparison?.heightChangePercent)} />
            <Metric label="Perimeter change" value={percent(comparison?.perimeterChangePercent)} />
            <Metric label="Mask IoU" value={number(comparison?.iou, 3)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ScanPanel title="Previous scan" scan={result.previous} />
            <ScanPanel title="Current scan" scan={result.current} />
          </div>

          <p className="text-xs leading-5 text-gray-500">
            Positive percentage changes indicate larger measured values in the
            current mask; negative values indicate smaller ones. These are
            image-derived measurements, not proof of biological change. IoU
            should only be interpreted as spatial overlap when the images are
            properly aligned.
          </p>
        </section>
      )}
    </main>
  );
}
