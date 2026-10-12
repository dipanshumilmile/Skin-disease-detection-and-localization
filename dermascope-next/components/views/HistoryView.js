
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

function backendUrl(path) {
  if (!path) return null;

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:')
  ) {
    return path;
  }

  return `${API_URL}/${path.replace(/^\/+/, '')}`;
}

function normalizeScan(scan) {
  const localization = scan.localization || {};

  return {
    ...scan,
    id: scan.id ?? scan.scan_id ?? scan.scanId,
    filename:
      scan.file_name ||
      scan.filename ||
      scan.name ||
      'Untitled image',
    prediction:
      scan.predicted_class ||
      scan.prediction ||
      scan.class_name ||
      scan.className ||
      'Unknown',
    confidence:
      scan.confidence ??
      scan.probability ??
      scan.score ??
      null,
    createdAt:
      scan.created_at ||
      scan.createdAt ||
      scan.timestamp ||
      scan.date ||
      null,
    imageUrl: backendUrl(
      scan.image_url ||
      scan.imageUrl ||
      scan.image ||
      null
    ),
    maskUrl: backendUrl(
      scan.mask_url ||
      scan.maskUrl ||
      localization.mask_url ||
      localization.mask ||
      null
    ),
    gradcamUrl: backendUrl(
      scan.gradcam_url ||
      scan.gradcamUrl ||
      scan.gradcam ||
      null
    ),
    areaPixels:
      localization.areaPixels ??
      localization.area_pixels ??
      scan.area_pixels ??
      scan.lesion_area ??
      scan.lesionArea ??
      null,
    areaAffectedPercent:
      localization.areaAffectedPercent ??
      localization.area_affected_percent ??
      scan.area_affected_percent ??
      null,
    perimeterPixels:
      localization.perimeterPixels ??
      localization.perimeter_pixels ??
      scan.perimeter_pixels ??
      null,
    bbox:
      localization.bbox ||
      scan.bbox ||
      null,
  };
}

function formatDate(value) {
  if (!value) return 'Unknown date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatConfidence(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  // The model may return 0–1, while some APIs return 0–100.
  const number = Number(value);
  const percent = number >= 0 && number <= 1
    ? number * 100
    : number;

  return `${percent.toFixed(1)}%`;
}

function formatPixels(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return `${Number(value).toLocaleString()} px²`;
}

function DetailCard({ label, value }) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] px-3 py-2.5">
      <div className="text-[10px] text-[var(--muted)] mb-1">
        {label}
      </div>
      <div className="font-mono text-[12.5px] font-semibold break-words">
        {value}
      </div>
    </div>
  );
}

export default function HistoryView() {
  const [history, setHistory] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/history`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          message || `Could not load history (${response.status}).`
        );
      }

      const data = await response.json();

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.history)
            ? data.history
            : [];

      const normalized = rows
        .map(normalizeScan)
        .filter((scan) => scan.id !== null && scan.id !== undefined);

      setHistory(normalized);

      // Keep the detail panel in sync after a refresh.
      setSelectedItem((previous) => {
        if (!previous) return null;

        return (
          normalized.find(
            (scan) => String(scan.id) === String(previous.id)
          ) || null
        );
      });
    } catch (err) {
      console.error('Failed to load scan history:', err);
      setError(
        err.message ||
        `Cannot connect to the backend at ${API_URL}.`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filters = useMemo(() => {
    const classes = history
      .map((scan) => scan.prediction)
      .filter((value) => value && value !== 'Unknown');

    return ['All', ...new Set(classes)];
  }, [history]);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();

    return history.filter((scan) => {
      const matchesFilter =
        activeFilter === 'All' ||
        scan.prediction === activeFilter;

      const matchesSearch =
        !query ||
        scan.filename.toLowerCase().includes(query) ||
        scan.prediction.toLowerCase().includes(query) ||
        String(scan.id).includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [history, activeFilter, search]);

  function openDetails(scan) {
    setSelectedItem(scan);
  }

  function compareScan(scan) {
    // VerifyView should listen for this event.
    window.dispatchEvent(
      new CustomEvent('open-verify', {
        detail: {
          historyId: scan.id,
          historyItem: scan,
        },
      })
    );
  }

  async function deleteScan(scan) {
    if (!scan?.id) return;

    const confirmed = window.confirm(
      `Delete "${scan.filename}" from history? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(scan.id);
    setError('');

    try {
      const response = await fetch(
        `${API_URL}/api/history/${encodeURIComponent(scan.id)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          message || `Delete failed (${response.status}).`
        );
      }

      setHistory((current) =>
        current.filter(
          (item) => String(item.id) !== String(scan.id)
        )
      );

      setSelectedItem((current) =>
        current && String(current.id) === String(scan.id)
          ? null
          : current
      );
    } catch (err) {
      console.error('Failed to delete scan:', err);
      setError(err.message || 'Could not delete this scan.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 mb-4">
        <div>
          <h2 className="text-[15px] font-bold m-0">
            Analysis history
          </h2>
          <p className="text-[11.5px] text-[var(--muted)] mt-1 mb-0">
            Saved image analyses and U-Net localization results.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={isLoading}
          className="text-[12px] px-3 py-1.5 rounded-full border border-[var(--line)] bg-transparent text-[var(--ink)] disabled:opacity-50"
        >
          {isLoading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="mb-3.5">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search filename, prediction, or scan ID…"
          className="w-full px-3 py-2 text-[12px] border border-[var(--line)] rounded-[3px] bg-[var(--panel)] text-[var(--ink)] outline-none focus:border-[var(--teal)]"
        />
      </div>

      <div className="flex gap-2 mb-3.5 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`shrink-0 text-[12px] px-3 py-1.5 border rounded-full ${
              activeFilter === filter
                ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                : 'text-[var(--muted)] border-[var(--line)] bg-transparent'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-[var(--line)] rounded-[3px] p-3 mb-4 text-[12px]">
          <div className="font-bold mb-1">History request failed</div>
          <div className="text-[var(--muted)]">{error}</div>
          <button
            type="button"
            onClick={loadHistory}
            className="mt-2 text-[var(--teal)] underline"
          >
            Try again
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="border border-[var(--line)] rounded-[3px] p-8 text-center text-[13px]">
          Loading saved analyses…
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="border border-dashed border-[var(--line)] rounded-[3px] p-10 text-center">
          <div className="text-[28px] mb-2">🗂</div>
          <div className="text-[13px] font-bold">
            {history.length === 0
              ? 'No saved analyses yet'
              : 'No matching analyses'}
          </div>
          <p className="text-[11.5px] text-[var(--muted)] mt-1">
            {history.length === 0
              ? 'Analyze an image first. Saved scans should appear here after the backend stores them in SQLite.'
              : 'Try another search or filter.'}
          </p>
        </div>
      ) : (
        <div className="border border-[var(--line)] rounded-[3px] overflow-hidden">
          <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 bg-[var(--panel)] border-b border-[var(--line)] text-[10px] text-[var(--muted)] font-bold uppercase">
            <span>Image</span>
            <span>File</span>
            <span>Prediction</span>
            <span>Confidence</span>
            <span>Date</span>
            <span>Actions</span>
          </div>

          {filteredHistory.map((scan) => (
            <div
              key={scan.id}
              className={`border-b border-[var(--line)] last:border-b-0 ${
                selectedItem?.id === scan.id
                  ? 'bg-[var(--teal-dim)]'
                  : ''
              }`}
            >
              <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => openDetails(scan)}
                  className="w-10 h-10 rounded-md overflow-hidden bg-[var(--line)] border-0 p-0"
                  aria-label={`View ${scan.filename}`}
                >
                  {scan.imageUrl ? (
                    <img
                      src={scan.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] text-[var(--muted)]">
                      IMG
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => openDetails(scan)}
                  className="text-left min-w-0 bg-transparent border-0"
                >
                  <div className="truncate font-semibold">
                    {scan.filename}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-0.5">
                    Scan #{scan.id}
                  </div>
                </button>

                <div>
                  <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    {scan.prediction}
                  </span>
                </div>

                <span className="font-mono text-[11px] text-[var(--muted)]">
                  {formatConfidence(scan.confidence)}
                </span>

                <div className="text-right">
                  <div className="text-[11px] text-[var(--muted)]">
                    {formatDate(scan.createdAt)}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {formatTime(scan.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => compareScan(scan)}
                    className="text-[10.5px] px-2.5 py-1.5 rounded-full border border-[var(--teal)] text-[var(--teal)]"
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetails(scan)}
                    className="text-[10.5px] px-2 py-1.5 rounded-full border border-[var(--line)] text-[var(--muted)]"
                  >
                    View
                  </button>
                </div>
              </div>

              <div className="md:hidden p-3.5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => openDetails(scan)}
                    className="w-12 h-12 rounded-md overflow-hidden bg-[var(--line)] shrink-0 border-0 p-0"
                  >
                    {scan.imageUrl ? (
                      <img
                        src={scan.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[9px] text-[var(--muted)]">
                        IMG
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[12.5px] break-words">
                      {scan.filename}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">
                      Scan #{scan.id} · {formatDate(scan.createdAt)}
                    </div>
                    <div className="text-[11px] mt-1">
                      {scan.prediction} · {formatConfidence(scan.confidence)}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-1">
                      Lesion area: {formatPixels(scan.areaPixels)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => compareScan(scan)}
                    className="flex-1 text-[11px] px-3 py-1.5 rounded-full border border-[var(--teal)] text-[var(--teal)]"
                  >
                    Compare with current
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetails(scan)}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--line)] text-[var(--muted)]"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <section className="mt-5 border border-[var(--line)] rounded-[3px] bg-[var(--panel)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
            <div>
              <h3 className="text-[13px] font-bold m-0">
                Analysis details
              </h3>
              <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
                Scan #{selectedItem.id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="text-[11px] px-2 py-1 rounded-full border border-[var(--line)]"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 p-4">
            <div className="space-y-3">
              <div className="aspect-[4/3] rounded-md overflow-hidden bg-[var(--line)]">
                {selectedItem.imageUrl ? (
                  <img
                    src={selectedItem.imageUrl}
                    alt="Saved scan"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[11px] text-[var(--muted)]">
                    Original image unavailable
                  </div>
                )}
              </div>

              {selectedItem.maskUrl && (
                <div>
                  <div className="text-[10px] text-[var(--muted)] mb-1">
                    Saved U-Net mask
                  </div>
                  <img
                    src={selectedItem.maskUrl}
                    alt="U-Net lesion localization mask"
                    className="w-full max-h-52 object-contain rounded-md border border-[var(--line)]"
                  />
                </div>
              )}

              {selectedItem.gradcamUrl && (
                <div>
                  <div className="text-[10px] text-[var(--muted)] mb-1">
                    Grad-CAM
                  </div>
                  <img
                    src={selectedItem.gradcamUrl}
                    alt="Grad-CAM visualization"
                    className="w-full max-h-52 object-contain rounded-md border border-[var(--line)]"
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-4">
                <div className="text-[10.5px] text-[var(--muted)] mb-1">
                  Classifier output
                </div>
                <div className="text-[20px] font-extrabold text-[var(--clay)]">
                  {selectedItem.prediction}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-1 break-words">
                  {selectedItem.filename}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <DetailCard
                  label="Confidence"
                  value={formatConfidence(selectedItem.confidence)}
                />
                <DetailCard
                  label="Lesion area"
                  value={formatPixels(selectedItem.areaPixels)}
                />
                <DetailCard
                  label="Affected image area"
                  value={
                    selectedItem.areaAffectedPercent == null
                      ? '—'
                      : `${Number(
                          selectedItem.areaAffectedPercent
                        ).toFixed(2)}%`
                  }
                />
                <DetailCard
                  label="Perimeter"
                  value={
                    selectedItem.perimeterPixels == null
                      ? '—'
                      : `${Number(
                          selectedItem.perimeterPixels
                        ).toFixed(1)} px`
                  }
                />
                <DetailCard
                  label="Date"
                  value={formatDate(selectedItem.createdAt)}
                />
                <DetailCard
                  label="Bounding box"
                  value={
                    selectedItem.bbox
                      ? `${selectedItem.bbox.width ?? '—'} × ${selectedItem.bbox.height ?? '—'} px`
                      : '—'
                  }
                />
              </div>

              <div className="mt-4 border-t border-[var(--line)] pt-3.5">
                <div className="text-[11px] text-[var(--muted)] font-bold mb-2">
                  Analysis models
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-[10px] px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    EfficientNetV2S · classification
                  </span>
                  <span className="font-mono text-[10px] px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    U-Net · localization
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => compareScan(selectedItem)}
                  className="font-bold text-[12px] px-4 py-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                >
                  Compare with current
                </button>
                <button
                  type="button"
                  disabled={deletingId === selectedItem.id}
                  onClick={() => deleteScan(selectedItem)}
                  className="font-bold text-[12px] px-4 py-2 rounded-full border border-[var(--line)] text-[var(--clay)] disabled:opacity-50"
                >
                  {deletingId === selectedItem.id
                    ? 'Deleting…'
                    : 'Delete scan'}
                </button>
              </div>

              <p className="text-[10.5px] text-[var(--muted)] mt-4">
                These results are image-analysis outputs, not a medical
                diagnosis. Pixel measurements may vary with image scale,
                framing, and capture conditions.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
