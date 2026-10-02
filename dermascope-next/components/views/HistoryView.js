'use client';

import { useEffect, useMemo, useState } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const DEFAULT_FILTERS = ['All'];

export default function HistoryView() {
  // ============================================================
  // STATE
  // ============================================================

  const [history, setHistory] = useState([]);

  const [activeFilter, setActiveFilter] =
    useState('All');

  const [selectedItem, setSelectedItem] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [showDetails, setShowDetails] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState(null);

  // ============================================================
  // LOAD HISTORY
  // ============================================================

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      /*
       * Future FastAPI endpoint:
       *
       * GET /history
       *
       * Example response:
       *
       * [
       *   {
       *     "id": 1,
       *     "filename": "IMG_0421.jpg",
       *     "created_at": "2026-09-20T10:30:00",
       *     "prediction": "Basal Cell Carcinoma",
       *     "confidence": 94.2,
       *     "lesion_area": 8420,
       *     "lesion_area_percent": 18.4,
       *     "image_url": "/history/1/image"
       *   }
       * ]
       */

      const response = await fetch(
        `${API_URL}/history`
      );

      if (!response.ok) {
        throw new Error(
          `Unable to load history (${response.status}).`
        );
      }

      const data = await response.json();

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.history)
            ? data.history
            : [];

      setHistory(items);
    } catch (err) {
      console.error('History error:', err);

      setHistory([]);

      setError(
        `History backend is not connected yet. Start your FastAPI server at ${API_URL}.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // URL HELPER
  // ============================================================

  const getImageUrl = (item) => {
    if (!item) {
      return null;
    }

    const image =
      item.image_url ||
      item.imageUrl ||
      item.image_path;

    if (image) {
      if (
        image.startsWith('http://') ||
        image.startsWith('https://') ||
        image.startsWith('blob:')
      ) {
        return image;
      }

      return `${API_URL}${image}`;
    }

    if (item.id !== undefined) {
      return `${API_URL}/history/${item.id}/image`;
    }

    return null;
  };

  // ============================================================
  // FORMAT DATE
  // ============================================================

  const formatDate = (value) => {
    if (!value) {
      return 'Unknown date';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString(
      undefined,
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }
    );
  };

  const formatTime = (value) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleTimeString(
      undefined,
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  };

  // ============================================================
  // FORMAT CONFIDENCE
  // ============================================================

  const formatConfidence = (value) => {
    if (
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
    ) {
      return '—';
    }

    return `${Number(value).toFixed(1)}%`;
  };

  // ============================================================
  // FORMAT AREA
  // ============================================================

  const formatArea = (value) => {
    if (
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
    ) {
      return '—';
    }

    return `${Number(value).toLocaleString()} px²`;
  };

  // ============================================================
  // GET PREDICTION
  // ============================================================

  const getPrediction = (item) => {
    return (
      item?.prediction ||
      item?.predicted_condition ||
      item?.condition ||
      item?.label ||
      'Unknown'
    );
  };

  // ============================================================
  // FILTERS
  // ============================================================

  const filters = useMemo(() => {
    const classes = history
      .map((item) => getPrediction(item))
      .filter(
        (value) =>
          value &&
          value !== 'Unknown'
      );

    return [
      ...DEFAULT_FILTERS,
      ...Array.from(new Set(classes)),
    ];
  }, [history]);

  // ============================================================
  // FILTER HISTORY
  // ============================================================

  const filteredHistory = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return history.filter((item) => {
      const prediction =
        getPrediction(item);

      const matchesFilter =
        activeFilter === 'All' ||
        prediction === activeFilter;

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const filename =
        item.filename ||
        item.file_name ||
        item.name ||
        '';

      return (
        filename
          .toLowerCase()
          .includes(query) ||
        prediction
          .toLowerCase()
          .includes(query)
      );
    });
  }, [
    history,
    activeFilter,
    search,
  ]);

  // ============================================================
  // SELECT ITEM
  // ============================================================

  const handleSelect = (item) => {
    setSelectedItem(item);
    setShowDetails(true);
  };

  // ============================================================
  // DELETE ITEM
  // ============================================================

  const handleDelete = async (item) => {
    if (!item?.id) {
      return;
    }

    const confirmed =
      window.confirm(
        'Delete this analysis from history? This cannot be undone.'
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);

    try {
      /*
       * Future FastAPI endpoint:
       *
       * DELETE /history/{id}
       */

      const response = await fetch(
        `${API_URL}/history/${item.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(
          `Unable to delete history item (${response.status}).`
        );
      }

      setHistory((current) =>
        current.filter(
          (entry) =>
            entry.id !== item.id
        )
      );

      if (
        selectedItem?.id === item.id
      ) {
        setSelectedItem(null);
        setShowDetails(false);
      }
    } catch (err) {
      console.error(
        'Delete history error:',
        err
      );

      setError(
        err?.message ||
          'Unable to delete this history item.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================================
  // OPEN COMPARISON
  // ============================================================

  const handleCompare = (item) => {
    /*
     * We dispatch a browser event rather than coupling
     * HistoryView directly to the parent routing implementation.
     *
     * Your page/Shell can later listen for:
     *
     * "open-verify"
     *
     * and switch to VerifyView.
     */

    window.dispatchEvent(
      new CustomEvent(
        'open-verify',
        {
          detail: {
            historyId: item.id,
            historyItem: item,
          },
        }
      )
    );
  };

  // ============================================================
  // CLEAR SEARCH
  // ============================================================

  const clearSearch = () => {
    setSearch('');
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 mb-4">

        <div>

          <h2 className="text-[15px] font-bold m-0">
            Analysis history
          </h2>

          <p className="text-[11.5px] text-[var(--muted)] mt-1 mb-0">
            Saved lesion analyses stored for later review and
            before-vs-current comparison.
          </p>

        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={isLoading}
          className="text-[12px] px-3 py-1.5 rounded-full border border-[var(--line)] bg-transparent text-[var(--ink)] cursor-pointer disabled:opacity-50"
        >
          {isLoading
            ? 'Refreshing…'
            : '↻ Refresh'}
        </button>

      </div>

      {/* ====================================================== */}
      {/* SEARCH */}
      {/* ====================================================== */}

      <div className="flex flex-col md:flex-row gap-2.5 mb-3.5">

        <div className="flex-1 relative">

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search filename or diagnosis…"
            className="w-full px-3 py-2 text-[12px] border border-[var(--line)] rounded-[3px] bg-[var(--panel)] text-[var(--ink)] outline-none focus:border-[var(--teal)]"
          />

          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer"
            >
              ✕
            </button>
          )}

        </div>

      </div>

      {/* ====================================================== */}
      {/* FILTERS */}
      {/* ====================================================== */}

      <div className="flex gap-2 mb-3.5 overflow-x-auto pb-1">

        {filters.map((filter) => (

          <button
            type="button"
            key={filter}
            onClick={() =>
              setActiveFilter(filter)
            }
            className={`shrink-0 text-[12px] px-3 py-1.5 border rounded-full cursor-pointer ${
              activeFilter === filter
                ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                : 'text-[var(--muted)] border-[var(--line)] bg-transparent'
            }`}
          >
            {filter}
          </button>

        ))}

      </div>

      {/* ====================================================== */}
      {/* ERROR */}
      {/* ====================================================== */}

      {error && (
        <div className="bg-[var(--gold-dim)] border border-[var(--line)] rounded-[3px] px-3.5 py-3 text-[12px] mb-4">

          <div className="font-bold text-[var(--gold)] mb-1">
            History unavailable
          </div>

          <div className="text-[var(--muted)]">
            {error}
          </div>

        </div>
      )}

      {/* ====================================================== */}
      {/* LOADING */}
      {/* ====================================================== */}

      {isLoading ? (

        <div className="border border-[var(--line)] rounded-[3px] p-8 text-center">

          <div className="text-[13px] font-semibold">
            Loading history…
          </div>

          <div className="text-[11.5px] text-[var(--muted)] mt-1">
            Retrieving saved analyses.
          </div>

        </div>

      ) : filteredHistory.length === 0 ? (

        /* ==================================================== */
        /* EMPTY STATE */
        /* ==================================================== */

        <div className="border border-dashed border-[var(--line)] rounded-[3px] p-10 text-center">

          <div className="text-[28px] mb-2">
            🗂
          </div>

          <div className="text-[13px] font-bold">
            {history.length === 0
              ? 'No saved analyses yet'
              : 'No matching analyses'}
          </div>

          <div className="text-[11.5px] text-[var(--muted)] mt-1 max-w-[420px] mx-auto">

            {history.length === 0
              ? 'After you analyze an image and save the result, it will appear here. Saved scans can later be selected for before-vs-current comparison.'
              : 'Try a different search term or filter.'}

          </div>

        </div>

      ) : (

        /* ==================================================== */
        /* HISTORY TABLE */
        /* ==================================================== */

        <div className="border border-[var(--line)] rounded-[3px] overflow-hidden">

          {/* TABLE HEADER */}

          <div className="hidden md:grid grid-cols-[auto_1fr_1.1fr_auto_auto_auto] items-center gap-3.5 px-4 py-2.5 bg-[var(--panel)] border-b border-[var(--line)] text-[10px] text-[var(--muted)] font-bold uppercase tracking-wide">

            <span>
              Image
            </span>

            <span>
              File
            </span>

            <span>
              Prediction
            </span>

            <span>
              Confidence
            </span>

            <span>
              Date
            </span>

            <span>
              Actions
            </span>

          </div>

          {filteredHistory.map(
            (row, index) => {

              const imageUrl =
                getImageUrl(row);

              const prediction =
                getPrediction(row);

              const confidence =
                row.confidence ??
                row.probability ??
                row.score;

              const area =
                row.lesion_area ??
                row.lesionArea;

              const date =
                row.created_at ||
                row.createdAt ||
                row.date ||
                row.timestamp;

              const isSelected =
                selectedItem?.id ===
                row.id;

              return (

                <div
                  key={
                    row.id ??
                    row.filename ??
                    index
                  }
                  className={`border-b border-[var(--line)] last:border-b-0 ${
                    isSelected
                      ? 'bg-[var(--teal-dim)]'
                      : ''
                  }`}
                >

                  {/* ======================================== */}
                  {/* DESKTOP */}
                  {/* ======================================== */}

                  <div className="hidden md:grid grid-cols-[auto_1fr_1.1fr_auto_auto_auto] items-center gap-3.5 px-4 py-3 text-[13px]">

                    {/* IMAGE */}

                    <button
                      type="button"
                      onClick={() =>
                        handleSelect(row)
                      }
                      className="w-10 h-10 rounded-md overflow-hidden bg-[var(--line)] cursor-pointer border-0 p-0"
                    >

                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-[var(--muted)]">
                          IMG
                        </div>
                      )}

                    </button>

                    {/* FILE */}

                    <button
                      type="button"
                      onClick={() =>
                        handleSelect(row)
                      }
                      className="text-left bg-transparent border-0 cursor-pointer min-w-0"
                    >

                      <div className="truncate text-[12.5px] font-semibold">
                        {row.filename ||
                          row.file_name ||
                          row.name ||
                          `Scan #${row.id}`}
                      </div>

                      <div className="text-[10px] text-[var(--muted)] mt-0.5">
                        ID #{row.id}
                      </div>

                    </button>

                    {/* PREDICTION */}

                    <div>

                      <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                        {prediction}
                      </span>

                    </div>

                    {/* CONFIDENCE */}

                    <span className="font-mono text-[11.5px] text-[var(--muted)]">
                      {formatConfidence(
                        confidence
                      )}
                    </span>

                    {/* DATE */}

                    <div className="text-right">

                      <div className="text-[11.5px] text-[var(--muted)]">
                        {formatDate(date)}
                      </div>

                      <div className="text-[10px] text-[var(--muted)] mt-0.5">
                        {formatTime(date)}
                      </div>

                    </div>

                    {/* ACTIONS */}

                    <div className="flex items-center gap-1.5">

                      <button
                        type="button"
                        onClick={() =>
                          handleCompare(row)
                        }
                        className="text-[10.5px] px-2.5 py-1.5 rounded-full border border-[var(--teal)] text-[var(--teal)] bg-transparent cursor-pointer"
                      >
                        Compare
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelect(row)
                        }
                        className="text-[10.5px] px-2 py-1.5 rounded-full border border-[var(--line)] text-[var(--muted)] bg-transparent cursor-pointer"
                      >
                        View
                      </button>

                    </div>

                  </div>

                  {/* ======================================== */}
                  {/* MOBILE */}
                  {/* ======================================== */}

                  <div className="md:hidden p-3.5">

                    <div className="flex items-start gap-3">

                      <button
                        type="button"
                        onClick={() =>
                          handleSelect(row)
                        }
                        className="w-12 h-12 rounded-md overflow-hidden bg-[var(--line)] shrink-0 border-0 p-0 cursor-pointer"
                      >

                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-[var(--muted)]">
                            IMG
                          </div>
                        )}

                      </button>

                      <div className="min-w-0 flex-1">

                        <div className="flex items-start justify-between gap-2">

                          <div className="min-w-0">

                            <div className="text-[12.5px] font-semibold truncate">
                              {row.filename ||
                                row.file_name ||
                                row.name ||
                                `Scan #${row.id}`}
                            </div>

                            <div className="text-[10px] text-[var(--muted)] mt-0.5">
                              {formatDate(date)}
                              {formatTime(date) &&
                                ` · ${formatTime(date)}`}
                            </div>

                          </div>

                          <span className="shrink-0 font-mono text-[9.5px] px-2 py-0.5 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                            {prediction}
                          </span>

                        </div>

                        <div className="flex items-center gap-4 mt-2">

                          <div>

                            <div className="text-[9.5px] text-[var(--muted)]">
                              Confidence
                            </div>

                            <div className="font-mono text-[11px]">
                              {formatConfidence(
                                confidence
                              )}
                            </div>

                          </div>

                          <div>

                            <div className="text-[9.5px] text-[var(--muted)]">
                              Lesion area
                            </div>

                            <div className="font-mono text-[11px]">
                              {formatArea(area)}
                            </div>

                          </div>

                        </div>

                      </div>

                    </div>

                    <div className="flex gap-2 mt-3">

                      <button
                        type="button"
                        onClick={() =>
                          handleCompare(row)
                        }
                        className="flex-1 text-[11px] px-3 py-1.5 rounded-full border border-[var(--teal)] text-[var(--teal)] bg-transparent cursor-pointer"
                      >
                        Compare with current
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelect(row)
                        }
                        className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--line)] text-[var(--muted)] bg-transparent cursor-pointer"
                      >
                        View
                      </button>

                    </div>

                  </div>

                </div>

              );
            }
          )}

        </div>

      )}

      {/* ====================================================== */}
      {/* SELECTED ITEM DETAILS */}
      {/* ====================================================== */}

      {showDetails && selectedItem && (

        <div className="mt-5 border border-[var(--line)] rounded-[3px] bg-[var(--panel)] overflow-hidden">

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
              onClick={() =>
                setShowDetails(false)
              }
              className="text-[11px] px-2 py-1 rounded-full border border-[var(--line)] bg-transparent cursor-pointer"
            >
              Close
            </button>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 p-4">

            {/* IMAGE */}

            <div>

              <div className="aspect-[4/3] rounded-md overflow-hidden bg-[var(--line)]">

                {getImageUrl(selectedItem) ? (
                  <img
                    src={getImageUrl(
                      selectedItem
                    )}
                    alt="Saved lesion"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--muted)]">
                    Image unavailable
                  </div>
                )}

              </div>

            </div>

            {/* DETAILS */}

            <div>

              <div className="mb-4">

                <div className="text-[10.5px] text-[var(--muted)] mb-1">
                  Predicted condition
                </div>

                <div className="text-[20px] font-extrabold text-[var(--clay)]">
                  {getPrediction(
                    selectedItem
                  )}
                </div>

              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">

                <DetailCard
                  label="Confidence"
                  value={formatConfidence(
                    selectedItem.confidence ??
                      selectedItem.probability ??
                      selectedItem.score
                  )}
                />

                <DetailCard
                  label="Lesion area"
                  value={formatArea(
                    selectedItem.lesion_area ??
                      selectedItem.lesionArea
                  )}
                />

                <DetailCard
                  label="Date"
                  value={formatDate(
                    selectedItem.created_at ||
                      selectedItem.createdAt ||
                      selectedItem.date
                  )}
                />

              </div>

              {/* MODEL INFORMATION */}

              <div className="mt-4 border-t border-[var(--line)] pt-3.5">

                <div className="text-[11px] text-[var(--muted)] font-bold mb-2">
                  Models
                </div>

                <div className="flex flex-wrap gap-2">

                  <span className="font-mono text-[10px] px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    EfficientNetV2S · classifier
                  </span>

                  <span className="font-mono text-[10px] px-2 py-1 rounded-full bg-[var(--teal-dim)] text-[var(--teal)]">
                    U-Net · localization
                  </span>

                </div>

              </div>

              {/* ACTIONS */}

              <div className="flex flex-wrap gap-2 mt-4">

                <button
                  type="button"
                  onClick={() =>
                    handleCompare(
                      selectedItem
                    )
                  }
                  className="font-bold text-[12px] px-4 py-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer"
                >
                  Compare with current
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDelete(
                      selectedItem
                    )
                  }
                  disabled={
                    deletingId ===
                    selectedItem.id
                  }
                  className="font-bold text-[12px] px-4 py-2 rounded-full border border-[var(--line)] bg-transparent text-[var(--clay)] cursor-pointer disabled:opacity-50"
                >
                  {deletingId ===
                  selectedItem.id
                    ? 'Deleting…'
                    : 'Delete'}
                </button>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ====================================================== */}
      {/* INFORMATION */}
      {/* ====================================================== */}

      <div className="mt-8">

        <div className="text-[13px] font-bold text-[var(--muted)] mb-3.5">
          History workflow
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">

          <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">

            <div className="text-[11.5px] text-[var(--muted)] mb-1.5">
              01 · Analyze
            </div>

            <div className="text-[15px] font-mono font-semibold">
              Upload a lesion image
            </div>

            <div className="text-[11.5px] text-[var(--muted)] mt-1">
              The classifier predicts the condition and U-Net
              localizes the lesion.
            </div>

          </div>

          <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">

            <div className="text-[11.5px] text-[var(--muted)] mb-1.5">
              02 · Save
            </div>

            <div className="text-[15px] font-mono font-semibold">
              Store the analysis
            </div>

            <div className="text-[11.5px] text-[var(--muted)] mt-1">
              The image and analysis metadata will be stored in
              SQLite.
            </div>

          </div>

          <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">

            <div className="text-[11.5px] text-[var(--muted)] mb-1.5">
              03 · Track
            </div>

            <div className="text-[15px] font-mono font-semibold">
              Compare over time
            </div>

            <div className="text-[11.5px] text-[var(--muted)] mt-1">
              Select an old scan here and compare it with a new
              image in Verify.
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

// ============================================================
// DETAIL CARD
// ============================================================

function DetailCard({
  label,
  value,
}) {
  return (
    <div className="border border-[var(--line)] rounded-[3px] px-3 py-2.5">

      <div className="text-[10px] text-[var(--muted)] mb-1">
        {label}
      </div>

      <div className="font-mono text-[12.5px] font-semibold">
        {value}
      </div>

    </div>
  );
}