
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
).replace(/\/$/, '');

/* ----------------------------------------
   API and data helpers
----------------------------------------- */

function imageUrl(path, type = 'image') {
  if (!path || typeof path !== 'string') return '';

  const value = path.trim();
  if (!value) return '';

  // A fully qualified URL can be used directly.
  if (/^https?:\/\//i.test(value)) return value;

  // Handle paths such as ./storage/uploads/a.png
  let cleanPath = value.replace(/\\/g, '/').replace(/^\.\//, '');

  // If the backend returns an absolute filesystem path that contains
  // the storage directory, keep only its public URL portion.
  const storageIndex = cleanPath.toLowerCase().lastIndexOf('/storage/');

  if (storageIndex >= 0) {
    cleanPath = cleanPath.slice(storageIndex);
  } else if (cleanPath.toLowerCase().startsWith('storage/')) {
    cleanPath = `/${cleanPath}`;
  } else if (!cleanPath.startsWith('/')) {
    // A bare filename is assumed to be in the corresponding folder.
    const folder = type === 'mask' ? 'masks' : 'uploads';
    cleanPath = `/storage/${folder}/${cleanPath}`;
  }

  return `${API_URL}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null
  );
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeScan(scan, index) {
  const rawBbox = firstDefined(
    scan.bbox,
    scan.localization?.bbox
  );

  const bbox =
    rawBbox && typeof rawBbox === 'object'
      ? {
          x: finiteNumber(
            firstDefined(rawBbox.x, rawBbox.left)
          ),
          y: finiteNumber(
            firstDefined(rawBbox.y, rawBbox.top)
          ),
          width: finiteNumber(
            firstDefined(rawBbox.width, rawBbox.w)
          ),
          height: finiteNumber(
            firstDefined(rawBbox.height, rawBbox.h)
          ),
        }
      : {
          x: finiteNumber(
            firstDefined(scan.bbox_x, scan.bboxX)
          ),
          y: finiteNumber(
            firstDefined(scan.bbox_y, scan.bboxY)
          ),
          width: finiteNumber(
            firstDefined(scan.bbox_width, scan.bboxWidth)
          ),
          height: finiteNumber(
            firstDefined(scan.bbox_height, scan.bboxHeight)
          ),
        };

  const createdAt = firstDefined(
    scan.createdAt,
    scan.created_at,
    scan.date
  );

  const imagePath = firstDefined(
    scan.imageUrl,
    scan.image_url,
    scan.image_path,
    scan.imagePath
  );

  const maskPath = firstDefined(
    scan.maskUrl,
    scan.mask_url,
    scan.mask_path,
    scan.maskPath,
    scan.localization?.maskUrl,
    scan.localization?.mask_url
  );

  return {
    ...scan,
    id: firstDefined(scan.id, scan.scanId, `scan-${index}`),
    fileName: firstDefined(
      scan.fileName,
      scan.file_name,
      scan.file,
      scan.filename,
      `Scan ${index + 1}`
    ),
    createdAt,
    date: formatDate(createdAt),
    imageUrl: imageUrl(imagePath, 'image'),
    maskUrl: imageUrl(maskPath, 'mask'),
    areaPixels: finiteNumber(
      firstDefined(
        scan.areaPixels,
        scan.area_pixels,
        scan.localization?.areaPixels,
        scan.localization?.area_pixels,
        scan.area
      )
    ),
    perimeterPixels: finiteNumber(
      firstDefined(
        scan.perimeterPixels,
        scan.perimeter_pixels,
        scan.localization?.perimeterPixels,
        scan.localization?.perimeter_pixels
      )
    ),
    bbox,
  };
}

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getArea(scan) {
  if (!scan) return null;

  const value = firstDefined(
    scan.areaPixels,
    scan.area_pixels,
    scan.localization?.areaPixels,
    scan.localization?.area_pixels,
    scan.area
  );

  if (typeof value === 'string') {
    return finiteNumber(value.replace(/[^0-9.-]/g, ''));
  }

  return finiteNumber(value);
}

function getBBox(scan) {
  if (!scan) return null;

  const bbox = scan.bbox ?? scan.localization?.bbox;

  if (bbox && typeof bbox === 'object') {
    const width = finiteNumber(
      firstDefined(bbox.width, bbox.w)
    );
    const height = finiteNumber(
      firstDefined(bbox.height, bbox.h)
    );

    if (width !== null || height !== null) {
      return {
        ...bbox,
        width,
        height,
      };
    }
  }

  const width = finiteNumber(
    firstDefined(scan.bbox_width, scan.bboxWidth)
  );
  const height = finiteNumber(
    firstDefined(scan.bbox_height, scan.bboxHeight)
  );

  if (width !== null || height !== null) {
    return {
      x: finiteNumber(firstDefined(scan.bbox_x, scan.bboxX)),
      y: finiteNumber(firstDefined(scan.bbox_y, scan.bboxY)),
      width,
      height,
    };
  }

  return null;
}

function getPerimeter(scan) {
  if (!scan) return null;

  return finiteNumber(
    firstDefined(
      scan.perimeterPixels,
      scan.perimeter_pixels,
      scan.localization?.perimeterPixels,
      scan.localization?.perimeter_pixels
    )
  );
}

function hasLocalization(scan) {
  return (
    getArea(scan) !== null ||
    getBBox(scan)?.width !== null ||
    getBBox(scan)?.height !== null ||
    getPerimeter(scan) !== null ||
    Boolean(scan?.maskUrl)
  );
}

function calculateAreaChange(previous, current) {
  const previousArea = getArea(previous);
  const currentArea = getArea(current);

  if (
    previousArea === null ||
    currentArea === null ||
    previousArea <= 0
  ) {
    return null;
  }

  return ((currentArea - previousArea) / previousArea) * 100;
}

function formatArea(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  return `${Number(value).toLocaleString()} px²`;
}

function formatPixels(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  return `${Number(value).toLocaleString()} px`;
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}

/* ----------------------------------------
   Main component
----------------------------------------- */

export default function LesionsView() {
  const [scans, setScans] = useState([]);
  const [selectedScanId, setSelectedScanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadScans = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const response = await fetch(`${API_URL}/api/history`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        let detail = '';

        try {
          const body = await response.json();
          detail = body.detail || body.message || '';
        } catch {
          // The response may not contain JSON.
        }

        throw new Error(
          detail || `Unable to load scan history (HTTP ${response.status}).`
        );
      }

      const payload = await response.json();

      // Support either a direct array or a wrapped history response.
      const records = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.scans)
        ? payload.scans
        : Array.isArray(payload?.history)
        ? payload.history
        : null;

      if (!records) {
        throw new Error(
          'The history endpoint did not return a scan array. Check GET /api/history.'
        );
      }

      const normalized = records
        .map((scan, index) => normalizeScan(scan, index))
        .sort((a, b) => {
          const dateA = a.createdAt
            ? new Date(a.createdAt).getTime()
            : NaN;
          const dateB = b.createdAt
            ? new Date(b.createdAt).getTime()
            : NaN;

          if (Number.isFinite(dateA) && Number.isFinite(dateB)) {
            return dateA - dateB;
          }

          if (Number.isFinite(dateA)) return -1;
          if (Number.isFinite(dateB)) return 1;

          return String(a.id).localeCompare(String(b.id), undefined, {
            numeric: true,
          });
        });

      setScans(normalized);

      // Keep the selected scan if it still exists.
      setSelectedScanId((previousId) => {
        if (
          previousId !== null &&
          normalized.some((scan) => String(scan.id) === String(previousId))
        ) {
          return previousId;
        }

        // Otherwise select the most recent scan.
        return normalized.length
          ? normalized[normalized.length - 1].id
          : null;
      });
    } catch (err) {
      console.error('Failed to load lesion history:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while loading scan history.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  const selectedIndex = useMemo(
    () =>
      scans.findIndex(
        (scan) => String(scan.id) === String(selectedScanId)
      ),
    [scans, selectedScanId]
  );

  const selected =
    selectedIndex >= 0 ? scans[selectedIndex] : null;

  const localizationChange = useMemo(() => {
    if (selectedIndex <= 0 || !selected) {
      return null;
    }

    const previous = scans[selectedIndex - 1];
    const previousArea = getArea(previous);
    const currentArea = getArea(selected);

    if (
      previousArea === null ||
      currentArea === null ||
      previousArea <= 0
    ) {
      return null;
    }

    return {
      previousArea,
      currentArea,
      change:
        ((currentArea - previousArea) / previousArea) * 100,
    };
  }, [selectedIndex, selected, scans]);

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold">
            Lesion localization history
          </div>

          <div className="text-[12px] text-[var(--muted)] mt-1">
            Review saved scans and compare U-Net localization measurements.
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadScans({ quiet: true })}
          disabled={loading || refreshing}
          className="self-start border border-[var(--line)] rounded-[3px] px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh history'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mb-5 border border-[var(--line)] rounded-[3px] p-6 text-center text-[13px] text-[var(--muted)]">
          Loading saved scans…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mb-5 border border-[var(--line)] rounded-[3px] p-4">
          <div className="text-[13px] font-semibold">
            Could not load scan history
          </div>

          <p className="text-[12px] text-[var(--muted)] mt-2 mb-3 break-words">
            {error}
          </p>

          <button
            type="button"
            onClick={() => loadScans()}
            className="border border-[var(--line)] rounded-[3px] px-3 py-2 text-[12px] font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {/* Scan selector */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-5">
          {scans.map((scan, index) => {
            const active =
              String(scan.id) === String(selectedScanId);

            return (
              <button
                key={scan.id}
                type="button"
                onClick={() => setSelectedScanId(scan.id)}
                aria-pressed={active}
                className="text-left border rounded-[3px] bg-[var(--panel)] p-3.5 cursor-pointer"
                style={{
                  borderColor: active ? 'var(--teal)' : 'var(--line)',
                  boxShadow: active ? '0 0 0 2px var(--teal)' : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold">
                      {scan.date || `Scan ${index + 1}`}
                    </div>

                    <div className="text-[11px] text-[var(--muted)] mt-1 truncate">
                      {scan.fileName || 'Image scan'}
                    </div>
                  </div>

                  <span className="shrink-0 text-[10px] font-mono px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    U-Net
                  </span>
                </div>

                <div className="mt-3 text-[12px] text-[var(--muted)]">
                  Localized area
                </div>

                <div className="text-[15px] font-mono font-semibold mt-0.5">
                  {formatArea(getArea(scan))}
                </div>

                {!hasLocalization(scan) && (
                  <div className="text-[10px] text-[var(--muted)] mt-2">
                    Localization metrics unavailable
                  </div>
                )}
              </button>
            );
          })}

          {scans.length === 0 && (
            <div className="md:col-span-3 border border-dashed border-[var(--line)] rounded-[3px] p-6 text-center text-[var(--muted)] text-[13px]">
              No saved scans are available yet. Analyze an image first, then refresh this view.
            </div>
          )}
        </div>
      )}

      {/* Selected scan */}
      {!loading && !error && selected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-5">
            {/* Image */}
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--line)]">
                <h3 className="text-[13px] font-bold m-0">
                  Selected scan
                </h3>

                <p className="text-[11px] text-[var(--muted)] mt-1 mb-0 break-words">
                  {selected.fileName}
                </p>
              </div>

              <div className="aspect-[4/3] bg-[var(--ink)] relative overflow-hidden">
                {selected.imageUrl ? (
                  <img
                    src={selected.imageUrl}
                    alt={selected.fileName || 'Lesion scan'}
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-[12px] p-4 text-center">
                    Image preview unavailable. Check the image URL returned by the backend.
                  </div>
                )}

                {selected.maskUrl && (
                  <img
                    src={selected.maskUrl}
                    alt="Lesion localization mask"
                    className="absolute inset-0 w-full h-full object-contain opacity-45 pointer-events-none"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>

              <div className="px-4 py-2 border-t border-[var(--line)] text-[11px] text-[var(--muted)]">
                {selected.maskUrl
                  ? 'Localization mask overlay enabled'
                  : 'No saved localization mask for this scan'}
              </div>
            </div>

            {/* Localization information */}
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] p-4">
              <div className="text-[13px] font-bold mb-3.5">
                U-Net localization
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label="Affected area"
                  value={formatArea(getArea(selected))}
                />

                <Metric
                  label="Width"
                  value={formatPixels(getBBox(selected)?.width)}
                />

                <Metric
                  label="Height"
                  value={formatPixels(getBBox(selected)?.height)}
                />

                <Metric
                  label="Perimeter"
                  value={formatPixels(getPerimeter(selected))}
                />
              </div>

              <div className="mt-4 px-3.5 py-3 border border-[var(--line)] rounded-[3px]">
                <div className="text-[11px] text-[var(--muted)] mb-1">
                  Localization status
                </div>

                <div className="text-[13px] font-semibold">
                  {hasLocalization(selected)
                    ? 'Localization data available'
                    : 'Localization data unavailable'}
                </div>
              </div>

              {selected.predicted_class && (
                <div className="mt-3 px-3.5 py-3 border border-[var(--line)] rounded-[3px]">
                  <div className="text-[11px] text-[var(--muted)] mb-1">
                    Recorded model prediction
                  </div>

                  <div className="text-[13px] font-semibold">
                    {selected.predicted_class}
                  </div>

                  {finiteNumber(selected.confidence) !== null && (
                    <div className="text-[12px] text-[var(--muted)] mt-1">
                      Confidence: {(Number(selected.confidence) <= 1
                        ? Number(selected.confidence) * 100
                        : Number(selected.confidence)
                      ).toFixed(1)}%
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Change measurement */}
          {localizationChange && (
            <div className="mb-5 bg-[var(--panel)] border border-[var(--line)] rounded-[3px] p-4">
              <div className="text-[13px] font-bold mb-3">
                Localization change vs. previous saved scan
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Metric
                  label="Previous localized area"
                  value={formatArea(localizationChange.previousArea)}
                />

                <Metric
                  label="Selected localized area"
                  value={formatArea(localizationChange.currentArea)}
                />

                <Metric
                  label="Area difference"
                  value={formatPercent(localizationChange.change)}
                />
              </div>

              <div className="mt-3 px-3.5 py-3 border border-[var(--line)] rounded-[3px] bg-[var(--paper)]">
                <p className="text-[11.5px] text-[var(--muted)] leading-relaxed m-0">
                  This is a numerical difference between localization
                  measurements from two saved scans. Unless the images
                  are comparable and are confirmed to show the same
                  lesion under consistent imaging conditions, the
                  difference should not be interpreted as medical
                  progression, regression, or diagnosis.
                </p>
              </div>
            </div>
          )}

          {/* Scan history table */}
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
              <h3 className="text-[13px] font-bold m-0">
                Scan history
              </h3>

              <span className="text-[11px] text-[var(--muted)] font-mono">
                {scans.length} {scans.length === 1 ? 'scan' : 'scans'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {[
                      'Date',
                      'Image',
                      'Localized area',
                      'Bounding box',
                      'Area difference',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="text-left text-[11px] text-[var(--muted)] font-bold px-3 py-2 border-b border-[var(--line)] whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {scans.map((scan, index) => {
                    const previous = index > 0 ? scans[index - 1] : null;
                    const change = calculateAreaChange(previous, scan);
                    const bbox = getBBox(scan);
                    const active =
                      String(scan.id) === String(selectedScanId);

                    return (
                      <tr
                        key={scan.id}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => setSelectedScanId(scan.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedScanId(scan.id);
                          }
                        }}
                        className="cursor-pointer"
                        style={{
                          background: active
                            ? 'var(--teal-dim)'
                            : 'transparent',
                        }}
                      >
                        <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                          {scan.date || `Scan ${index + 1}`}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)]">
                          {scan.fileName || 'Image'}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)] font-mono whitespace-nowrap">
                          {formatArea(getArea(scan))}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)] font-mono whitespace-nowrap">
                          {bbox &&
                          (bbox.width !== null || bbox.height !== null)
                            ? `${formatPixels(bbox.width)} × ${formatPixels(bbox.height)}`
                            : '—'}
                        </td>

                        <td
                          className="px-3 py-2.5 border-b border-[var(--line)] font-mono whitespace-nowrap"
                          style={{
                            color:
                              change === null
                                ? 'var(--muted)'
                                : change > 0
                                ? 'var(--clay)'
                                : 'var(--muted)',
                          }}
                        >
                          {change === null ? '—' : formatPercent(change)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------
   Reusable metric
----------------------------------------- */

function Metric({ label, value }) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] p-3">
      <div className="text-[10.5px] text-[var(--muted)] mb-1">
        {label}
      </div>

      <div className="text-[14px] font-mono font-semibold break-words">
        {value}
      </div>
    </div>
  );
}