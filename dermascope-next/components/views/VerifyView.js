'use client';

import { useEffect, useRef, useState } from 'react';
import LesionPhoto from '../ui/LesionPhoto';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const HISTORY_KEY = 'dermascope_history';

/*
Expected history object:

{
  id: 1,
  fileName: "lesion-01.jpg",
  imageUrl: "...",
  createdAt: "...",

  classification: {
    label: "Melanocytic Nevi",
    confidence: 58.3
  },

  localization: {
    maskUrl: "...",
    areaPixels: 12400,
    bbox: {
      x: 72,
      y: 48,
      width: 116,
      height: 108
    },
    perimeterPixels: 450
  }
}

The localization object is the important part for Verify.
It represents the U-Net result saved from the previous scan.
*/

export default function VerifyView() {
  const fileInputRef = useRef(null);

  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  const [currentFile, setCurrentFile] = useState(null);
  const [currentPreview, setCurrentPreview] = useState('');

  const [loading, setLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [error, setError] = useState('');

  /*
   * Load previous scans.
   *
   * For now this uses localStorage so the frontend can work before
   * your SQLite/backend is finished.
   *
   * Later replace this with:
   * GET /history
   */
  useEffect(() => {
    loadHistory();

    const handleOpenVerify = (event) => {
      const scanId = event?.detail?.scanId;

      if (scanId !== undefined && scanId !== null) {
        setSelectedId(String(scanId));
      }

      loadHistory();
    };

    window.addEventListener('open-verify', handleOpenVerify);

    return () => {
      window.removeEventListener('open-verify', handleOpenVerify);
    };
  }, []);

  function loadHistory() {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);

      if (!saved) {
        setHistory([]);
        return;
      }

      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch (err) {
      console.error('Unable to load history:', err);
      setHistory([]);
    }
  }

  const selectedScan = history.find(
    (item) => String(item.id) === String(selectedId)
  );

  /*
   * Select a previous scan.
   */
  function handlePreviousChange(event) {
    const id = event.target.value;

    setSelectedId(id);
    setCompareResult(null);
    setError('');
  }

  /*
   * Open file picker.
   */
  function handleChooseCurrent() {
    fileInputRef.current?.click();
  }

  /*
   * Current image upload.
   */
  function handleCurrentFile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    setError('');
    setCompareResult(null);

    setCurrentFile(file);

    const url = URL.createObjectURL(file);
    setCurrentPreview(url);
  }

  /*
   * Drag & drop support.
   */
  function handleDrop(event) {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file.');
      return;
    }

    setError('');
    setCompareResult(null);

    setCurrentFile(file);

    const url = URL.createObjectURL(file);
    setCurrentPreview(url);
  }

  /*
   * Send previous scan + current image to backend.
   *
   * IMPORTANT:
   *
   * The backend /compare endpoint should:
   *
   * 1. Get previous scan
   * 2. Get previous U-Net localization
   * 3. Run U-Net on current image
   * 4. Compare previous mask and current mask
   * 5. Return localization metrics
   */
  async function handleCompare() {
    if (!selectedScan) {
      setError('Please select a previous scan from History.');
      return;
    }

    if (!currentFile) {
      setError('Please upload the current image.');
      return;
    }

    setError('');
    setCompareResult(null);
    setLoading(true);

    try {
      const formData = new FormData();

      /*
       * Send the previous scan ID.
       *
       * Backend should retrieve the previous image/localization
       * from SQLite/storage using this ID.
       */
      formData.append('previous_scan_id', selectedScan.id);

      /*
       * Send current image.
       */
      formData.append('current_image', currentFile);

      const response = await fetch(`${API_URL}/compare`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Compare request failed: ${response.status}`);
      }

      const data = await response.json();

      setCompareResult(data);
    } catch (err) {
      console.error(err);

      /*
       * Do NOT generate fake U-Net results here.
       *
       * Your backend does not exist yet, so showing fake
       * localization values would make the UI look like
       * the ML model actually ran.
       */
      setError(
        'Comparison backend is not available yet. The frontend is ready for the /compare API.'
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * Format percentage.
   */
  function formatPercent(value) {
    if (value === undefined || value === null) return '—';

    const number = Number(value);

    if (!Number.isFinite(number)) return '—';

    return `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
  }

  /*
   * Format pixel values.
   */
  function formatPixels(value) {
    if (value === undefined || value === null) return '—';

    const number = Number(value);

    if (!Number.isFinite(number)) return '—';

    return number.toLocaleString();
  }

  return (
    <div>
      {/* Intro */}
      <div className="bg-[var(--gold-dim)] border border-[var(--line)] rounded-[3px] px-3.5 py-2.5 text-[12.5px] mb-5">
        <strong className="text-[var(--gold)]">
          Localization-based comparison.
        </strong>{' '}
        Select a previous scan from History and upload a current image. The
        comparison is based on lesion localization results rather than a
        direct raw-image comparison.
      </div>

      {/* Step 1 */}
      <div className="mb-5">
        <div className="text-[13px] font-bold text-[var(--muted)] mb-2.5">
          01 — Select previous scan
        </div>

        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] p-4">
          {history.length === 0 ? (
            <div className="text-[12.5px] text-[var(--muted)]">
              No previous scans are available yet. Analyze and save a scan
              first, then return here.
            </div>
          ) : (
            <select
              value={selectedId}
              onChange={handlePreviousChange}
              className="w-full border border-[var(--line)] rounded-[3px] bg-[var(--paper)] px-3 py-2.5 text-[13px] outline-none"
            >
              <option value="">
                Select a previous scan from History
              </option>

              {history.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {scan.fileName || `Scan ${scan.id}`}
                  {scan.createdAt
                    ? ` — ${new Date(scan.createdAt).toLocaleString()}`
                    : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Previous/current images */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
        {/* Previous */}
        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
            <h4 className="text-[13px] font-bold m-0">
              Previous scan
            </h4>

            <span className="text-[11px] text-[var(--muted)] font-mono">
              History
            </span>
          </div>

          {selectedScan ? (
            <>
              <div className="relative aspect-[4/3] bg-[var(--ink)] overflow-hidden">
                {selectedScan.imageUrl ? (
                  <img
                    src={selectedScan.imageUrl}
                    alt={selectedScan.fileName || 'Previous scan'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <LesionPhoto className="absolute inset-0 w-full h-full" />
                )}

                {/* Previous U-Net mask */}
                {selectedScan.localization?.maskUrl && (
                  <img
                    src={selectedScan.localization.maskUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
                  />
                )}
              </div>

              <div className="px-4 py-3.5">
                <p className="text-[16px] font-extrabold text-[var(--clay)] m-0 mb-1">
                  {selectedScan.classification?.label || 'Previous scan'}
                </p>

                {selectedScan.classification?.confidence !== undefined && (
                  <p className="font-mono text-[12.5px] text-[var(--muted)] m-0 mb-3">
                    {Number(
                      selectedScan.classification.confidence
                    ).toFixed(1)}
                    % classification confidence
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Metric
                    label="U-Net area"
                    value={`${formatPixels(
                      selectedScan.localization?.areaPixels
                    )} px`}
                  />

                  <Metric
                    label="Perimeter"
                    value={`${formatPixels(
                      selectedScan.localization?.perimeterPixels
                    )} px`}
                  />
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon="◌"
              text="Select a previous scan to view its localization."
            />
          )}
        </div>

        {/* Current */}
        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
            <h4 className="text-[13px] font-bold m-0">
              Current scan
            </h4>

            <span className="text-[11px] text-[var(--gold)] font-mono">
              New image
            </span>
          </div>

          {currentPreview ? (
            <div className="relative aspect-[4/3] bg-[var(--ink)] overflow-hidden">
              <img
                src={currentPreview}
                alt="Current scan preview"
                className="absolute inset-0 w-full h-full object-cover"
              />

              {compareResult?.current?.maskUrl && (
                <img
                  src={compareResult.current.maskUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
                />
              )}
            </div>
          ) : (
            <div
              className="aspect-[4/3] border-b border-dashed border-[var(--line)] flex flex-col items-center justify-center gap-2 text-[var(--muted)] text-[12.5px] cursor-pointer"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onClick={handleChooseCurrent}
            >
              <span className="text-[22px]">📷</span>

              <span>
                Drag the current image here
              </span>

              <span className="text-[11px]">
                or click to browse
              </span>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleChooseCurrent();
                }}
                className="text-[12px] px-3 py-1.5 mt-1 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer"
              >
                Upload current photo
              </button>
            </div>
          )}

          <div className="px-4 py-3.5">
            {currentFile ? (
              <>
                <p className="text-[13px] font-semibold m-0 mb-1">
                  {currentFile.name}
                </p>

                <p className="text-[11.5px] text-[var(--muted)] m-0">
                  {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                </p>

                <button
                  type="button"
                  onClick={handleChooseCurrent}
                  className="mt-3 text-[12px] px-3 py-1.5 rounded-full border border-[var(--line)] text-[var(--muted)] bg-transparent cursor-pointer"
                >
                  Change image
                </button>
              </>
            ) : (
              <p className="text-[12px] text-[var(--muted)] m-0">
                No current image selected.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleCurrentFile}
        className="hidden"
      />

      {/* Error */}
      {error && (
        <div className="mt-4 px-4 py-3.5 rounded-[3px] border border-[#d79483] bg-[var(--clay-dim)] text-[13px] text-[var(--clay)]">
          <span className="mr-2">⚠</span>
          {error}
        </div>
      )}

      {/* Compare button */}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          disabled={!selectedScan || !currentFile || loading}
          onClick={handleCompare}
          className={`px-5 py-2.5 rounded-[3px] text-[13px] font-bold border ${
            !selectedScan || !currentFile || loading
              ? 'border-[var(--line)] text-[var(--muted)] bg-[var(--panel)] cursor-not-allowed'
              : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer'
          }`}
        >
          {loading
            ? 'Running localization comparison...'
            : 'Compare U-Net localization'}
        </button>
      </div>

      {/* Comparison result */}
      {compareResult && (
        <ComparisonResult result={compareResult} />
      )}

      {/* How it works */}
      <div className="text-[13px] font-bold text-[var(--muted)] mt-11 mb-3.5">
        How this comparison works
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <InfoCard
          number="01"
          title="Previous localization"
          value="U-Net mask"
          description="Uses the localization saved with the selected History scan."
        />

        <InfoCard
          number="02"
          title="Current localization"
          value="U-Net mask"
          description="The current image is sent to the backend for U-Net localization."
        />

        <InfoCard
          number="03"
          title="Comparison"
          value="Mask vs mask"
          description="Area, bounding box and overlap metrics are calculated from localization results."
        />
      </div>
    </div>
  );
}


/* ----------------------------------------
   Comparison result
----------------------------------------- */

function ComparisonResult({ result }) {
  const previous = result?.previous;
  const current = result?.current;
  const comparison = result?.comparison;

  if (!comparison) {
    return (
      <div className="mt-6 border border-[var(--line)] rounded-[3px] bg-[var(--panel)] p-4">
        <p className="text-[13px] font-semibold m-0">
          Localization results received
        </p>

        <p className="text-[12px] text-[var(--muted)] mt-1">
          The backend response does not contain comparison metrics yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="text-[13px] font-bold text-[var(--muted)]">
            Localization comparison
          </div>

          <div className="text-[11.5px] text-[var(--muted)] mt-1">
            Calculated from previous and current U-Net localization results.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Previous area"
          value={`${Number(previous?.areaPixels || 0).toLocaleString()} px`}
        />

        <Metric
          label="Current area"
          value={`${Number(current?.areaPixels || 0).toLocaleString()} px`}
        />

        <Metric
          label="Area change"
          value={formatComparisonPercent(
            comparison.areaChangePercent
          )}
        />

        <Metric
          label="Mask IoU"
          value={
            comparison.iou !== undefined
              ? Number(comparison.iou).toFixed(3)
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Metric
          label="Width change"
          value={formatComparisonPercent(
            comparison.widthChangePercent
          )}
        />

        <Metric
          label="Height change"
          value={formatComparisonPercent(
            comparison.heightChangePercent
          )}
        />

        <Metric
          label="Perimeter change"
          value={formatComparisonPercent(
            comparison.perimeterChangePercent
          )}
        />
      </div>

      <div className="mt-4 px-4 py-3.5 rounded-[3px] border border-[var(--line)] bg-[var(--panel)]">
        <p className="text-[12px] text-[var(--muted)] m-0 leading-relaxed">
          These values describe differences between the two localization
          results. They are image-analysis measurements and should not by
          themselves be interpreted as a medical diagnosis or as proof of
          disease progression or improvement.
        </p>
      </div>
    </div>
  );
}


/* ----------------------------------------
   Small components
----------------------------------------- */

function Metric({ label, value }) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] p-3 bg-[var(--panel)]">
      <div className="text-[10.5px] text-[var(--muted)] mb-1">
        {label}
      </div>

      <div className="text-[14px] font-mono font-semibold">
        {value}
      </div>
    </div>
  );
}


function InfoCard({ number, title, value, description }) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">
      <div className="text-[11px] text-[var(--muted)] mb-1.5">
        {number} · {title}
      </div>

      <div className="text-[15px] font-mono font-semibold">
        {value}
      </div>

      <div className="text-[11.5px] text-[var(--muted)] mt-1 leading-relaxed">
        {description}
      </div>
    </div>
  );
}


function EmptyState({ icon, text }) {
  return (
    <div className="aspect-[4/3] flex flex-col items-center justify-center gap-2 text-[var(--muted)]">
      <span className="text-[24px]">{icon}</span>

      <span className="text-[12px] text-center px-8">
        {text}
      </span>
    </div>
  );
}


function formatComparisonPercent(value) {
  if (value === undefined || value === null) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}