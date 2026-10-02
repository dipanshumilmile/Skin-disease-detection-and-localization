'use client';

import { useMemo, useState } from 'react';
import { LESION_SCAN_HISTORY } from '../../lib/data';

export default function LesionsView() {
  const [selectedScan, setSelectedScan] = useState(0);

  /*
   * Group scans into tracked lesions only if your data provides
   * a lesionId.
   *
   * Until backend tracking is implemented, we simply display
   * localization-based scan history.
   */
  const scans = Array.isArray(LESION_SCAN_HISTORY)
    ? LESION_SCAN_HISTORY
    : [];

  const selected = scans[selectedScan];

  /*
   * Calculate localization changes from the stored U-Net area.
   *
   * This is deliberately an image-analysis measurement.
   * It does NOT say that a disease has progressed or improved.
   */
  const localizationChange = useMemo(() => {
    if (selectedScan <= 0 || !selected) {
      return null;
    }

    const previous = scans[selectedScan - 1];

    const currentArea = getArea(previous);
    const nextArea = getArea(selected);

    if (
      currentArea === null ||
      nextArea === null ||
      currentArea === 0
    ) {
      return null;
    }

    const change =
      ((nextArea - currentArea) / currentArea) * 100;

    return {
      previousArea: currentArea,
      currentArea: nextArea,
      change,
    };
  }, [selectedScan, selected, scans]);

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="text-[15px] font-bold">
          Lesion localization history
        </div>

        <div className="text-[12px] text-[var(--muted)] mt-1">
          Review previous scans and compare lesion localization
          measurements produced by the U-Net model.
        </div>
      </div>

      {/* Scan selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-5">
        {scans.map((scan, index) => {
          const active = index === selectedScan;

          return (
            <button
              key={scan.id ?? index}
              type="button"
              onClick={() => setSelectedScan(index)}
              className="text-left border rounded-[3px] bg-[var(--panel)] p-3.5 cursor-pointer"
              style={{
                borderColor: active
                  ? 'var(--teal)'
                  : 'var(--line)',
                boxShadow: active
                  ? '0 0 0 2px var(--teal)'
                  : 'none',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-bold">
                    {scan.date || `Scan ${index + 1}`}
                  </div>

                  <div className="text-[11px] text-[var(--muted)] mt-1">
                    {scan.fileName || scan.file || 'Image scan'}
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                  U-Net
                </span>
              </div>

              <div className="mt-3 text-[12px] text-[var(--muted)]">
                Localized area
              </div>

              <div className="text-[15px] font-mono font-semibold mt-0.5">
                {formatArea(getArea(scan))}
              </div>
            </button>
          );
        })}

        {scans.length === 0 && (
          <div className="md:col-span-3 border border-dashed border-[var(--line)] rounded-[3px] p-6 text-center text-[var(--muted)] text-[13px]">
            No lesion scans are available yet.
          </div>
        )}
      </div>

      {/* Selected scan */}
      {selected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-5">
            {/* Image */}
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--line)]">
                <h3 className="text-[13px] font-bold m-0">
                  Selected scan
                </h3>
              </div>

              <div className="aspect-[4/3] bg-[var(--ink)] relative overflow-hidden">
                {selected.imageUrl ? (
                  <img
                    src={selected.imageUrl}
                    alt={selected.fileName || 'Lesion scan'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-[12px]">
                    Image preview unavailable
                  </div>
                )}

                {/* U-Net mask */}
                {selected.maskUrl && (
                  <img
                    src={selected.maskUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
                  />
                )}
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
                  value={formatPixels(
                    getBBox(selected)?.width
                  )}
                />

                <Metric
                  label="Height"
                  value={formatPixels(
                    getBBox(selected)?.height
                  )}
                />

                <Metric
                  label="Perimeter"
                  value={formatPixels(
                    getPerimeter(selected)
                  )}
                />
              </div>

              <div className="mt-4 px-3.5 py-3 border border-[var(--line)] rounded-[3px]">
                <div className="text-[11px] text-[var(--muted)] mb-1">
                  Localization status
                </div>

                <div className="text-[13px] font-semibold">
                  {hasLocalization(selected)
                    ? 'U-Net localization available'
                    : 'Localization data unavailable'}
                </div>
              </div>
            </div>
          </div>

          {/* Change measurement */}
          {localizationChange && (
            <div className="mb-5 bg-[var(--panel)] border border-[var(--line)] rounded-[3px] p-4">
              <div className="text-[13px] font-bold mb-3">
                Localization change vs. previous scan
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Metric
                  label="Previous localized area"
                  value={formatArea(
                    localizationChange.previousArea
                  )}
                />

                <Metric
                  label="Current localized area"
                  value={formatArea(
                    localizationChange.currentArea
                  )}
                />

                <Metric
                  label="Area difference"
                  value={formatPercent(
                    localizationChange.change
                  )}
                />
              </div>

              <div className="mt-3 px-3.5 py-3 border border-[var(--line)] rounded-[3px] bg-[var(--paper)]">
                <p className="text-[11.5px] text-[var(--muted)] leading-relaxed m-0">
                  This value represents a difference between U-Net
                  localization measurements from two scans. It is
                  an image-analysis measurement and does not by
                  itself establish medical progression,
                  regression, or diagnosis.
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
                {scans.length} scans
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
                    const previous =
                      index > 0
                        ? scans[index - 1]
                        : null;

                    const change = calculateAreaChange(
                      previous,
                      scan
                    );

                    const bbox = getBBox(scan);

                    return (
                      <tr
                        key={scan.id ?? index}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedScan(index)
                        }
                      >
                        <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                          {scan.date ||
                            scan.createdAt ||
                            `Scan ${index + 1}`}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)]">
                          {scan.fileName ||
                            scan.file ||
                            'Image'}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)] font-mono">
                          {formatArea(getArea(scan))}
                        </td>

                        <td className="px-3 py-2.5 border-b border-[var(--line)] font-mono">
                          {bbox
                            ? `${formatPixels(
                                bbox.width
                              )} × ${formatPixels(
                                bbox.height
                              )}`
                            : '—'}
                        </td>

                        <td
                          className="px-3 py-2.5 border-b border-[var(--line)] font-mono"
                          style={{
                            color:
                              change === null
                                ? 'var(--muted)'
                                : change > 0
                                ? 'var(--clay)'
                                : 'var(--muted)',
                          }}
                        >
                          {change === null
                            ? '—'
                            : formatPercent(change)}
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
   Helpers
----------------------------------------- */

function getArea(scan) {
  if (!scan) return null;

  /*
   * Support the possible structures while your
   * frontend/backend contract is being developed.
   */

  if (scan.localization?.areaPixels !== undefined) {
    return Number(scan.localization.areaPixels);
  }

  if (scan.areaPixels !== undefined) {
    return Number(scan.areaPixels);
  }

  /*
   * Existing mock data may have:
   * area: "12,400 px"
   *
   * Extract the numeric part if necessary.
   */
  if (typeof scan.area === 'string') {
    const value = Number(
      scan.area.replace(/[^0-9.]/g, '')
    );

    return Number.isFinite(value) ? value : null;
  }

  if (typeof scan.area === 'number') {
    return scan.area;
  }

  return null;
}


function getBBox(scan) {
  if (!scan) return null;

  if (scan.localization?.bbox) {
    return scan.localization.bbox;
  }

  if (scan.bbox) {
    return scan.bbox;
  }

  return null;
}


function getPerimeter(scan) {
  if (!scan) return null;

  if (
    scan.localization?.perimeterPixels !== undefined
  ) {
    return Number(
      scan.localization.perimeterPixels
    );
  }

  if (scan.perimeterPixels !== undefined) {
    return Number(scan.perimeterPixels);
  }

  return null;
}


function hasLocalization(scan) {
  return (
    getArea(scan) !== null ||
    getBBox(scan) !== null ||
    getPerimeter(scan) !== null ||
    Boolean(scan?.maskUrl) ||
    Boolean(scan?.localization?.maskUrl)
  );
}


function calculateAreaChange(previous, current) {
  const previousArea = getArea(previous);
  const currentArea = getArea(current);

  if (
    previousArea === null ||
    currentArea === null ||
    previousArea === 0
  ) {
    return null;
  }

  return (
    ((currentArea - previousArea) /
      previousArea) *
    100
  );
}


function formatArea(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return `${Number(value).toLocaleString()} px²`;
}


function formatPixels(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return `${Number(value).toLocaleString()} px`;
}


function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  const number = Number(value);

  return `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}


function Metric({ label, value }) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] p-3">
      <div className="text-[10.5px] text-[var(--muted)] mb-1">
        {label}
      </div>

      <div className="text-[14px] font-mono font-semibold">
        {value}
      </div>
    </div>
  );
}