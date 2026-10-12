
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const IMAGE_SIZE = 224;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const VIEW_OPTIONS = [
  { id: "gradcam", label: "Grad-CAM", description: "Model attention heatmap" },
  { id: "binary-mask", label: "Binary Mask", description: "U-Net lesion mask" },
  {
    id: "bounding-box",
    label: "Bounding Box",
    description: "Lesion boundary localization",
  },
];

const DEFAULT_VIEWS = ["gradcam", "binary-mask", "bounding-box"];

function makeBackendUrl(url) {
  if (!url) return null;

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  if (url.startsWith("/")) return `${API_URL}${url}`;

  return `${API_URL}/${url}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "—";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "—";
}

function formatConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return `${(number <= 1 ? number * 100 : number).toFixed(2)}%`;
}

function normalizeResult(data, fileName, startedAt) {
  const classification = data.classification || {};
  const localization = data.localization || {};

  const confidence = Number(
    classification.confidence ?? data.confidence ?? 0
  );

  return {
    scanId: data.scan_id ?? data.scanId ?? null,
    fileName: data.file_name ?? data.fileName ?? fileName,
    prediction:
      classification.className ??
      data.prediction ??
      data.className ??
      "Unknown",
    confidence,
    probabilities:
      classification.probabilities ?? data.probabilities ?? {},
    gradcamUrl: makeBackendUrl(data.gradcam ?? data.gradcamUrl),
    localization: {
      ...localization,
      mask: makeBackendUrl(localization.mask ?? data.mask),
      areaPixels: localization.areaPixels ?? data.areaPixels ?? null,
      areaAffectedPercent:
        localization.areaAffectedPercent ??
        data.areaAffectedPercent ??
        null,
      perimeterPixels:
        localization.perimeterPixels ?? data.perimeterPixels ?? null,
      bbox: localization.bbox ?? data.bbox ?? null,
    },
    inferenceTime:
      data.inference_time ??
      data.inferenceTime ??
      data.processing_time_ms ??
      Date.now() - startedAt,
  };
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3" />
        <path d="M16 4h3a1 1 0 0 1 1 1v3" />
        <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
        <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4M10.5 7.5v6M7.5 10.5h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4M7.5 10.5h6" />
      </>
    ),
    reset: (
      <>
        <path d="M3 11a9 9 0 1 1 2.64 6.36" />
        <path d="M3 4v7h7" />
      </>
    ),
    close: (
      <>
        <path d="m18 6-12 12M6 6l12 12" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </>
    ),
    alert: (
      <>
        <path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
        <path d="m19 14 1.2 2.8L23 18l-2.8 1.1L19 22l-1.1-2.9L15 18l2.9-1.2L19 14Z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name] || paths.image}</svg>;
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  compact = false,
}) {
  return (
    <div
      className={`visual-zoom-controls ${compact ? "zoom-controls-compact" : ""}`}
      onClick={(event) => event.stopPropagation()}
      role="group"
      aria-label="Image zoom controls"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= 1}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Icon name="zoomOut" size={16} />
      </button>

      <span className="zoom-percentage">{Math.round(zoom * 100)}%</span>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= 3}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Icon name="zoomIn" size={16} />
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={zoom === 1}
        title="Reset zoom"
        aria-label="Reset zoom"
        className="zoom-reset-button"
      >
        <Icon name="reset" size={14} />
        <span>Reset</span>
      </button>
    </div>
  );
}

function VisualCard({
  cardId,
  title,
  subtitle,
  imageUrl,
  result,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpen,
  type = "image",
  bbox,
  badge,
  isDark = false,
}) {
  const imageTransform = {
    transform: `scale(${zoom})`,
  };

  return (
    <article className="visual-card">
      <div className="visual-card-heading">
        <div className="visual-heading-copy">
          <h3 className="visual-card-title">{title}</h3>
          <p className="visual-card-subtitle">{subtitle}</p>
        </div>

        {badge && <span className="visual-badge">{badge}</span>}
      </div>

      <ZoomControls
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onReset={onResetZoom}
      />

      <button
        type="button"
        className={`visual-image-area ${type === "binary-mask" ? "binary-image-area" : ""}`}
        onClick={() => onOpen?.({ cardId, title, imageUrl, type, bbox })}
        aria-label={`Open ${title} in enlarged view`}
      >
        {imageUrl ? (
          <div className="visual-image-zoom-stage">
            <img
              src={imageUrl}
              alt={title}
              className={`visual-image ${type === "binary-mask" ? "binary-mask-image" : ""}`}
              style={imageTransform}
              draggable="false"
            />

            {type === "bounding-box" && bbox && (
              <svg
                className="bbox-overlay"
                viewBox={`0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}`}
                preserveAspectRatio="none"
                aria-label="Lesion bounding box"
              >
                <rect
                  x={bbox.x}
                  y={bbox.y}
                  width={bbox.width}
                  height={bbox.height}
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="1.8"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={bbox.x}
                  y={Math.max(0, bbox.y - 12)}
                  width={Math.min(110, Math.max(40, bbox.width))}
                  height="12"
                  fill="#00ff88"
                />
                <text
                  x={bbox.x + 4}
                  y={Math.max(9, bbox.y - 3)}
                  fill="#022c22"
                  fontSize="7"
                  fontWeight="bold"
                >
                  LESION
                </text>
              </svg>
            )}
          </div>
        ) : (
          <div className="visual-placeholder">
            <Icon name="image" size={30} />
            <span>Visualization unavailable</span>
            <small>Run an analysis to generate this view.</small>
          </div>
        )}

        <span className="image-expand-hint">
          <Icon name="zoomIn" size={14} />
          Click to enlarge
        </span>
      </button>

      <div className="visual-card-footer">
        <div>
          <span className="metric-label">Inference latency</span>
          <strong className="metric-value">
            {result?.inferenceTime != null
              ? `${Number(result.inferenceTime).toFixed(0)} ms`
              : "—"}
          </strong>
        </div>

        {type === "bounding-box" && bbox && (
          <div className="bbox-status">
            <span className="status-dot" />
            Boundary detected
          </div>
        )}

        {type === "binary-mask" && (
          <span className="mini-tag">U-Net mask</span>
        )}

        {type === "gradcam" && (
          <span className="mini-tag">Model attention</span>
        )}
      </div>
    </article>
  );
}

export default function AnalyzeView() {
  const inputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const maskUrlRef = useRef(null);
  const segmentedUrlRef = useRef(null);
  const requestIdRef = useRef(0);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [selectedViews, setSelectedViews] = useState(DEFAULT_VIEWS);
  const [cardZoom, setCardZoom] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [segmentedLesionUrl, setSegmentedLesionUrl] = useState(null);
  const [maskBbox, setMaskBbox] = useState(null);
  const [caseOptions, setCaseOptions] = useState([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [reviewFlagged, setReviewFlagged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const updateTheme = () => {
      setIsDark(
        root.classList.contains("dark") ||
          root.getAttribute("data-theme") === "dark" ||
          document.body.classList.contains("dark")
      );
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (maskUrlRef.current) URL.revokeObjectURL(maskUrlRef.current);
      if (segmentedUrlRef.current) URL.revokeObjectURL(segmentedUrlRef.current);
    };
  }, []);

  const getCardZoom = useCallback(
    (cardId) => cardZoom[cardId] || 1,
    [cardZoom]
  );

  const changeCardZoom = useCallback((cardId, amount) => {
    setCardZoom((previous) => ({
      ...previous,
      [cardId]: clamp(
        Math.round(((previous[cardId] || 1) + amount) * 100) / 100,
        1,
        3
      ),
    }));
  }, []);

  const resetCardZoom = useCallback((cardId) => {
    setCardZoom((previous) => ({
      ...previous,
      [cardId]: 1,
    }));
  }, []);

  const setFile = useCallback((file) => {
    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Please select a JPG, JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image size must be 10 MB or less.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;

    setSelectedFile(file);
    setPreviewUrl(nextUrl);
    setResult(null);
    setSegmentedLesionUrl(null);
    setMaskBbox(null);
    setError("");
    setReviewFlagged(false);
    setSelectedCase("");
    setCardZoom({});
    setLightbox(null);
    setLightboxZoom(1);
  }, []);

  const handleFileInput = (event) => {
    setFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    setFile(event.dataTransfer.files?.[0]);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError("Upload a skin lesion image before starting the analysis.");
      return;
    }

    const currentRequest = ++requestIdRef.current;

    setLoading(true);
    setError("");
    setResult(null);
    setSegmentedLesionUrl(null);
    setMaskBbox(null);
    setCardZoom({});

    const startedAt = Date.now();
    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "The image analysis failed."
        );
      }

      if (currentRequest !== requestIdRef.current) return;

      const normalized = normalizeResult(
        data,
        selectedFile.name,
        startedAt
      );

      setResult(normalized);

      try {
        const history = JSON.parse(
          localStorage.getItem("dermascope-history") || "[]"
        );

        history.unshift({
          scanId: normalized.scanId,
          fileName: normalized.fileName,
          prediction: normalized.prediction,
          confidence: normalized.confidence,
          date: new Date().toISOString(),
        });

        localStorage.setItem(
          "dermascope-history",
          JSON.stringify(history.slice(0, 50))
        );
      } catch {
        // Analysis remains available if browser storage is disabled.
      }

      setCaseOptions((previous) => {
        const entry = {
          id: String(normalized.scanId ?? Date.now()),
          fileName: normalized.fileName,
          prediction: normalized.prediction,
          confidence: normalized.confidence,
          scanId: normalized.scanId,
        };

        return [
          entry,
          ...previous.filter((item) => item.id !== entry.id),
        ].slice(0, 10);
      });

      setSelectedCase(String(normalized.scanId ?? ""));
    } catch (err) {
      if (currentRequest === requestIdRef.current) {
        setError(
          err.message ||
            "Unable to connect to the analysis server. Check that your FastAPI backend is running."
        );
      }
    } finally {
      if (currentRequest === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const maskUrl = result?.localization?.mask || null;

  
useEffect(() => {
  if (!previewUrl || !maskUrl) {
    setSegmentedLesionUrl(null);
    setMaskBbox(null);
    return;
  }

  let cancelled = false;
  let generatedUrl = null;

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });

  async function generateSegmentedLesion() {
    try {
      const [original, mask] = await Promise.all([
        loadImage(previewUrl),
        loadImage(maskUrl),
      ]);

      if (cancelled) return;

      const size = 224;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) throw new Error("Canvas is unavailable.");

      context.drawImage(original, 0, 0, size, size);

      const originalData = context.getImageData(0, 0, size, size);

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = size;
      maskCanvas.height = size;

      const maskContext = maskCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!maskContext) throw new Error("Mask canvas is unavailable.");

      maskContext.drawImage(mask, 0, 0, size, size);

      const maskData = maskContext.getImageData(0, 0, size, size);

      let minX = size;
      let minY = size;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const index = (y * size + x) * 4;

          const r = maskData.data[index];
          const g = maskData.data[index + 1];
          const b = maskData.data[index + 2];

          const foreground = (r + g + b) / 3 > 127;

          if (foreground) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          } else {
            originalData.data[index + 3] = 0;
          }
        }
      }

      if (maxX < 0 || maxY < 0) {
        throw new Error(
          "The mask contains no white foreground pixels. Check whether your mask uses white for the lesion."
        );
      }

      context.putImageData(originalData, 0, 0);

      setMaskBbox({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });

      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;

        generatedUrl = URL.createObjectURL(blob);

        if (segmentedUrlRef.current) {
          URL.revokeObjectURL(segmentedUrlRef.current);
        }

        segmentedUrlRef.current = generatedUrl;
        setSegmentedLesionUrl(generatedUrl);
      }, "image/png");
    } catch (error) {
      console.error("Segmented lesion generation failed:", error);

      if (!cancelled) {
        setSegmentedLesionUrl(null);
        setMaskBbox(null);
      }
    }
  }

  generateSegmentedLesion();

  return () => {
    cancelled = true;

    if (generatedUrl && generatedUrl !== segmentedUrlRef.current) {
      URL.revokeObjectURL(generatedUrl);
    }
  };
}, [previewUrl, maskUrl]);


  const bbox = useMemo(() => {
    const source = maskBbox || result?.localization?.bbox;

    if (!source) return null;

    const x = clamp(
      Number(source.x ?? source.xMin ?? 0),
      0,
      IMAGE_SIZE
    );

    const y = clamp(
      Number(source.y ?? source.yMin ?? 0),
      0,
      IMAGE_SIZE
    );

    const rawWidth = Number(
      source.width ??
        Number(source.xMax ?? x) - x
    );

    const rawHeight = Number(
      source.height ??
        Number(source.yMax ?? y) - y
    );

    const x2 = clamp(x + Math.max(0, rawWidth), x, IMAGE_SIZE);
    const y2 = clamp(y + Math.max(0, rawHeight), y, IMAGE_SIZE);

    if (x2 <= x || y2 <= y) return null;

    return {
      x,
      y,
      width: x2 - x,
      height: y2 - y,
    };
  }, [maskBbox, result]);

  const toggleView = (id) => {
    setSelectedViews((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const openLightbox = (item) => {
    if (!item.imageUrl) return;

    setLightbox(item);
    setLightboxZoom(1);
  };

  const closeLightbox = () => {
    setLightbox(null);
    setLightboxZoom(1);
  };

  useEffect(() => {
    if (!lightbox) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeLightbox();

      if (event.key === "+" || event.key === "=") {
        setLightboxZoom((zoom) => clamp(zoom + 0.25, 1, 4));
      }

      if (event.key === "-") {
        setLightboxZoom((zoom) => clamp(zoom - 0.25, 1, 4));
      }

      if (event.key === "0") {
        setLightboxZoom(1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  const handleCaseChange = (event) => {
    const id = event.target.value;
    setSelectedCase(id);

    const entry = caseOptions.find((item) => item.id === id);

    if (entry) {
      setResult((previous) =>
        previous
          ? {
              ...previous,
              scanId: entry.scanId,
              fileName: entry.fileName,
              prediction: entry.prediction,
              confidence: entry.confidence,
            }
          : previous
      );
    }
  };

  const handleFlagForReview = () => {
    if (!result) return;

    try {
      const flags = JSON.parse(
        localStorage.getItem("dermascope-review-flags") || "[]"
      );

      flags.unshift({
        scanId: result.scanId,
        fileName: result.fileName,
        prediction: result.prediction,
        confidence: result.confidence,
        flaggedAt: new Date().toISOString(),
      });

      localStorage.setItem(
        "dermascope-review-flags",
        JSON.stringify(flags.slice(0, 50))
      );

      setReviewFlagged(true);
    } catch {
      setError("Unable to save the review flag in browser storage.");
    }
  };

  const handleExportReport = async () => {
    if (!result?.scanId) {
      setError("A scan ID is required to export the PDF report.");
      return;
    }

    setExporting(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/reports/${result.scanId}/pdf`
      );

      if (!response.ok) {
        throw new Error(
          "PDF export is unavailable. Verify that your backend implements the PDF report endpoint."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `dermascope-report-${result.scanId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Unable to export the report.");
    } finally {
      setExporting(false);
    }
  };

  const gradcamUrl = result?.gradcamUrl;
  const binaryMaskUrl = result?.localization?.mask;

  const renderProbabilities = () => {
    const probabilities = result?.probabilities || {};
    const entries = Object.entries(probabilities);

    if (!entries.length) {
      return (
        <p className="muted-text">
          Class probabilities were not returned by the model.
        </p>
      );
    }

    return (
      <div className="probability-list">
        {entries
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map(([name, rawValue]) => {
            const numericValue = Number(rawValue);
            const fraction =
              numericValue <= 1 ? numericValue : numericValue / 100;
            const percent = clamp(fraction * 100, 0, 100);

            return (
              <div className="probability-row" key={name}>
                <div className="probability-label-line">
                  <span>{name}</span>
                  <strong>{percent.toFixed(2)}%</strong>
                </div>

                <div className="probability-track">
                  <div
                    className={`probability-fill ${
                      name === result.prediction ? "probability-fill-active" : ""
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  const gridClass = `visual-grid visual-grid-${selectedViews.length}`;

  return (
    <main className={`dermascope-analyze-page ${isDark ? "theme-dark" : ""}`}>
      <style jsx global>{`
        .dermascope-analyze-page {
          --an-bg: #f7f9fc;
          --an-surface: #ffffff;
          --an-surface-soft: #f8fafc;
          --an-text: #0f172a;
          --an-muted: #64748b;
          --an-border: #e2e8f0;
          --an-accent: #059669;
          --an-accent-soft: #ecfdf5;
          --an-shadow: 0 12px 36px rgba(15, 23, 42, 0.055);
          color: var(--an-text);
          background: var(--an-bg);
          min-height: 100%;
          padding: 28px;
          border-radius: 22px;
          transition: background 250ms ease, color 250ms ease;
        }

        .dark .dermascope-analyze-page,
        [data-theme="dark"] .dermascope-analyze-page,
        .dermascope-analyze-page.theme-dark {
          --an-bg: #080f1d;
          --an-surface: #111b2d;
          --an-surface-soft: #162237;
          --an-text: #e5edf7;
          --an-muted: #9aaac0;
          --an-border: #2b3a50;
          --an-accent: #34d399;
          --an-accent-soft: #10372f;
          --an-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
        }

        .dermascope-analyze-page *,
        .dermascope-analyze-page *::before,
        .dermascope-analyze-page *::after {
          box-sizing: border-box;
        }

        .dermascope-analyze-page button,
        .dermascope-analyze-page input,
        .dermascope-analyze-page select {
          font: inherit;
        }

        .analyze-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 26px;
        }

        .analyze-kicker {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--an-accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          margin-bottom: 9px;
        }

        .analyze-title {
          font-size: clamp(27px, 3vw, 36px);
          line-height: 1.15;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin: 0;
          color: var(--an-text);
        }

        .analyze-description {
          color: var(--an-muted);
          margin: 10px 0 0;
          max-width: 690px;
          font-size: 14px;
          line-height: 1.7;
        }

        .analyze-header-tag {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 13px;
          border: 1px solid var(--an-border);
          background: var(--an-surface);
          border-radius: 999px;
          color: var(--an-muted);
          font-size: 12px;
          font-weight: 700;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #10b981;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12);
          display: inline-block;
          flex-shrink: 0;
        }

        .analyze-stack {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .upload-card,
        .result-card,
        .section-card {
          min-width: 0;
          padding: 22px;
          border: 1px solid var(--an-border);
          border-radius: 22px;
          background: var(--an-surface);
          box-shadow: var(--an-shadow);
          transition: background 250ms ease, border-color 250ms ease;
        }

        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 18px;
        }

        .section-title {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: var(--an-text);
        }

        .section-description {
          margin: 6px 0 0;
          color: var(--an-muted);
          font-size: 13px;
          line-height: 1.6;
        }

        .upload-dropzone {
          display: flex;
          align-items: center;
          gap: 17px;
          padding: 24px;
          border: 1.5px dashed #a7b8c9;
          background: var(--an-surface-soft);
          border-radius: 17px;
          cursor: pointer;
          transition: border-color 200ms ease, background 200ms ease;
        }

        .upload-dropzone:hover,
        .upload-dropzone.is-dragging {
          border-color: var(--an-accent);
          background: var(--an-accent-soft);
        }

        .upload-icon-box {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 52px;
          height: 52px;
          color: var(--an-accent);
          background: var(--an-accent-soft);
          border-radius: 15px;
        }

        .upload-copy {
          flex: 1;
          min-width: 0;
        }

        .upload-copy strong {
          display: block;
          font-size: 14px;
          font-weight: 800;
          color: var(--an-text);
          overflow-wrap: anywhere;
        }

        .upload-copy span {
          display: block;
          margin-top: 5px;
          color: var(--an-muted);
          font-size: 12px;
          line-height: 1.6;
        }

        .upload-file-button {
          flex-shrink: 0;
          padding: 10px 14px;
          border: 1px solid var(--an-border);
          background: var(--an-surface);
          color: var(--an-text);
          border-radius: 11px;
          font-size: 12px;
          font-weight: 800;
        }

        .upload-preview-row {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-top: 17px;
          padding: 12px;
          background: var(--an-surface-soft);
          border: 1px solid var(--an-border);
          border-radius: 15px;
        }

        .upload-preview-image {
          width: 76px;
          height: 76px;
          border-radius: 11px;
          object-fit: cover;
          background: #020617;
        }

        .upload-preview-info {
          flex: 1;
          min-width: 0;
        }

        .upload-preview-info strong {
          display: block;
          color: var(--an-text);
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .upload-preview-info span {
          display: block;
          margin-top: 5px;
          color: var(--an-muted);
          font-size: 12px;
        }

        .primary-button,
        .secondary-button,
        .outline-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 12px 17px;
          min-height: 43px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 180ms ease, opacity 180ms ease,
            background 180ms ease, border-color 180ms ease;
        }

        .primary-button {
          border: 1px solid #059669;
          background: #059669;
          color: #ffffff;
        }

        .primary-button:hover:not(:disabled) {
          background: #047857;
          transform: translateY(-1px);
        }

        .secondary-button {
          border: 1px solid var(--an-border);
          background: var(--an-surface-soft);
          color: var(--an-text);
        }

        .outline-button {
          border: 1px solid var(--an-border);
          background: transparent;
          color: var(--an-text);
        }

        .primary-button:disabled,
        .secondary-button:disabled,
        .outline-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 18px;
        }

        .error-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 15px;
          color: #b91c1c;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 13px;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .dark .dermascope-analyze-page .error-banner,
        [data-theme="dark"] .dermascope-analyze-page .error-banner,
        .dermascope-analyze-page.theme-dark .error-banner {
          color: #fca5a5;
          background: #351c28;
          border-color: #713343;
        }

        .result-topline {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
        }

        .result-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--an-accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .result-prediction {
          margin: 9px 0 0;
          font-size: 25px;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--an-text);
          overflow-wrap: anywhere;
        }

        .result-meta {
          color: var(--an-muted);
          margin-top: 7px;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .confidence-pill,
        .visual-badge,
        .mini-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-shrink: 0;
          padding: 7px 10px;
          color: var(--an-accent);
          background: var(--an-accent-soft);
          border: 1px solid rgba(16, 185, 129, 0.18);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.035em;
        }

        .result-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .result-metric {
          padding: 15px;
          background: var(--an-surface-soft);
          border: 1px solid var(--an-border);
          border-radius: 15px;
          min-width: 0;
        }

        .metric-label {
          display: block;
          color: var(--an-muted);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.5;
        }

        .metric-value {
          display: block;
          margin-top: 6px;
          color: var(--an-text);
          font-size: 18px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .muted-text {
          color: var(--an-muted);
          font-size: 13px;
          line-height: 1.7;
        }

        .visualization-section {
          margin-top: 26px;
        }

        .visual-controls-card {
          padding: 19px 21px;
          margin-bottom: 18px;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          border-radius: 18px;
        }

        .view-checkbox-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

        .view-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 10px 13px;
          background: var(--an-surface-soft);
          border: 1px solid var(--an-border);
          border-radius: 12px;
          color: var(--an-text);
          cursor: pointer;
          transition: border-color 180ms ease, background 180ms ease;
        }

        .view-checkbox:has(input:checked) {
          background: var(--an-accent-soft);
          border-color: var(--an-accent);
        }

        .view-checkbox input {
          width: 15px;
          height: 15px;
          accent-color: var(--an-accent);
        }

        .view-checkbox-copy strong {
          display: block;
          font-size: 12px;
          font-weight: 800;
        }

        .view-checkbox-copy span {
          display: block;
          margin-top: 3px;
          color: var(--an-muted);
          font-size: 10px;
        }

        .visual-grid {
          display: grid;
          gap: 18px;
          align-items: stretch;
          transition: grid-template-columns 450ms cubic-bezier(.22, 1, .36, 1);
        }

        .visual-grid-3 {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .visual-grid-2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .visual-grid-1 {
          grid-template-columns: minmax(0, 760px);
          justify-content: center;
        }

        .visual-grid-0 {
          grid-template-columns: minmax(0, 1fr);
        }

        .visual-card {
          min-width: 0;
          padding: 17px;
          border-radius: 20px;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          box-shadow: var(--an-shadow);
          opacity: 1;
          transform: translateY(0);
          animation: analyze-card-enter 400ms cubic-bezier(.22, 1, .36, 1);
          transition: transform 300ms ease, border-color 300ms ease,
            box-shadow 300ms ease, background 250ms ease;
        }

        .visual-card:hover {
          transform: translateY(-3px);
          border-color: rgba(16, 185, 129, 0.55);
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.09);
        }

        @keyframes analyze-card-enter {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .visual-card-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 13px;
        }

        .visual-heading-copy {
          min-width: 0;
        }

        .visual-card-title {
          margin: 0;
          color: var(--an-text);
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.02em;
          overflow-wrap: anywhere;
        }

        .visual-card-subtitle {
          margin: 5px 0 0;
          color: var(--an-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .visual-badge {
          font-size: 9px;
          padding: 6px 8px;
        }

        .visual-zoom-controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          margin-bottom: 11px;
        }

        .visual-zoom-controls button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          color: var(--an-text);
          background: var(--an-surface-soft);
          border: 1px solid var(--an-border);
          border-radius: 9px;
          cursor: pointer;
          transition: background 180ms ease, border-color 180ms ease,
            opacity 180ms ease;
        }

        .visual-zoom-controls button:hover:not(:disabled) {
          background: var(--an-accent-soft);
          border-color: var(--an-accent);
        }

        .visual-zoom-controls button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .zoom-percentage {
          min-width: 43px;
          text-align: center;
          color: var(--an-muted);
          font-size: 11px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        .zoom-reset-button {
          font-size: 10px;
          font-weight: 700;
        }

        .visual-image-area {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 1 / 1;
          min-height: 0;
          padding: 0;
          overflow: hidden;
          border: 0;
          border-radius: 15px;
          background: radial-gradient(
            circle at 50% 35%,
            #334155 0%,
            #111827 65%,
            #020617 100%
          );
          cursor: zoom-in;
          isolation: isolate;
        }

        .binary-image-area {
          background: #000000;
        }

        .visual-image-zoom-stage {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .visual-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          transform-origin: center center;
          transition: transform 220ms cubic-bezier(.22, 1, .36, 1);
          user-select: none;
          pointer-events: none;
        }

        .binary-mask-image {
          image-rendering: auto;
          object-fit: fill;
          background: #000000;
        }

        .bbox-overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          pointer-events: none;
          transform: scale(var(--bbox-zoom, 1));
          transform-origin: center center;
        }

        .visual-image-area:has(.bbox-overlay) .visual-image-zoom-stage {
          --bbox-zoom: 1;
        }

        .visual-image-area:has(.bbox-overlay) .visual-image,
        .visual-image-area:has(.bbox-overlay) .bbox-overlay {
          transform: scale(var(--shared-image-zoom, 1));
        }

        .visual-image-area:has(.bbox-overlay) .visual-image-zoom-stage {
          overflow: hidden;
        }

        .visual-image-area:has(.bbox-overlay) .visual-image {
          transform: scale(var(--shared-image-zoom, 1));
        }

        .visual-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          height: 100%;
          min-height: 230px;
          color: #cbd5e1;
          font-size: 12px;
          padding: 22px;
          text-align: center;
        }

        .visual-placeholder small {
          color: #94a3b8;
          font-size: 10px;
          line-height: 1.6;
        }

        .image-expand-hint {
          position: absolute;
          bottom: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 9px;
          color: #f8fafc;
          background: rgba(2, 6, 23, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 9px;
          font-size: 10px;
          font-weight: 700;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 180ms ease, transform 180ms ease;
          pointer-events: none;
        }

        .visual-image-area:hover .image-expand-hint {
          opacity: 1;
          transform: translateY(0);
        }

        .visual-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding-top: 14px;
        }

        .visual-card-footer .metric-value {
          font-size: 14px;
        }

        .bbox-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--an-accent);
          font-size: 10px;
          font-weight: 800;
        }

        .bbox-status .status-dot {
          width: 6px;
          height: 6px;
        }

        .empty-views {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 42px 20px;
          border: 1px dashed var(--an-border);
          border-radius: 20px;
          background: var(--an-surface);
        }

        .empty-views-icon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          color: var(--an-accent);
          background: var(--an-accent-soft);
          border-radius: 16px;
          margin-bottom: 15px;
        }

        .empty-views h3 {
          margin: 0;
          color: var(--an-text);
          font-size: 17px;
          font-weight: 800;
        }

        .empty-views p {
          max-width: 420px;
          margin: 8px 0 17px;
          color: var(--an-muted);
          font-size: 12px;
          line-height: 1.7;
        }

        .derived-section {
          margin-top: 28px;
        }

        .derived-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .derived-card {
          min-width: 0;
          padding: 17px;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          border-radius: 20px;
          box-shadow: var(--an-shadow);
          transition: border-color 250ms ease, background 250ms ease;
          animation: analyze-card-enter 400ms ease both;
        }

        .derived-card:nth-child(2) {
          animation-delay: 60ms;
        }

        .derived-card:nth-child(3) {
          animation-delay: 120ms;
        }

        .derived-card-heading {
          min-height: 53px;
          margin-bottom: 13px;
        }

        .derived-card-heading h3 {
          margin: 0;
          color: var(--an-text);
          font-size: 15px;
          font-weight: 800;
        }

        .derived-card-heading p {
          margin: 5px 0 0;
          color: var(--an-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .derived-image-area {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #020617;
          border-radius: 15px;
          padding: 0;
          border: 0;
          cursor: zoom-in;
          display: block;
        }

        .derived-image-area img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          transform-origin: center center;
          transition: transform 220ms ease;
          pointer-events: none;
        }

        .derived-image-area .segmented-lesion-image {
          object-fit: contain;
          background: #020617;
        }

        .derived-footer {
          margin-top: 12px;
          color: var(--an-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 18px;
          margin-top: 26px;
        }

        .probability-list {
          display: flex;
          flex-direction: column;
          gap: 17px;
          margin-top: 20px;
        }

        .probability-label-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          color: var(--an-text);
          font-size: 12px;
        }

        .probability-label-line strong {
          font-variant-numeric: tabular-nums;
        }

        .probability-track {
          width: 100%;
          height: 7px;
          overflow: hidden;
          background: var(--an-border);
          border-radius: 999px;
          margin-top: 8px;
        }

        .probability-fill {
          height: 100%;
          background: #94a3b8;
          border-radius: 999px;
          transition: width 600ms cubic-bezier(.22, 1, .36, 1);
        }

        .probability-fill-active {
          background: linear-gradient(90deg, #059669, #34d399);
        }

        .localization-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          margin-top: 12px;
        }

        .localization-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid var(--an-border);
          font-size: 12px;
        }

        .localization-row:last-child {
          border-bottom: 0;
        }

        .localization-row span {
          color: var(--an-muted);
        }

        .localization-row strong {
          color: var(--an-text);
          font-weight: 800;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .result-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }

        .case-switcher {
          min-width: 0;
          max-width: 100%;
          padding: 9px 12px;
          color: var(--an-text);
          background: var(--an-surface-soft);
          border: 1px solid var(--an-border);
          border-radius: 10px;
          font-size: 12px;
        }

        .disclaimer {
          margin-top: 24px;
          padding: 15px 17px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid var(--an-border);
          border-radius: 14px;
          background: var(--an-surface-soft);
          color: var(--an-muted);
          font-size: 11px;
          line-height: 1.7;
        }

        .disclaimer strong {
          color: var(--an-text);
        }

        .lightbox-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(2, 6, 23, 0.88);
          backdrop-filter: blur(12px);
          animation: lightbox-fade-in 180ms ease;
        }

        @keyframes lightbox-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .lightbox-panel {
          width: min(1050px, 100%);
          max-height: 94vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 20px;
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.5);
        }

        .lightbox-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          padding: 14px 18px;
          background: #111c30;
          border-bottom: 1px solid #263449;
        }

        .lightbox-heading {
          min-width: 0;
        }

        .lightbox-heading h3 {
          margin: 0;
          color: #f8fafc;
          font-size: 15px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .lightbox-heading p {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 11px;
        }

        .lightbox-toolbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .lightbox-toolbar .visual-zoom-controls {
          margin: 0;
        }

        .lightbox-toolbar .visual-zoom-controls button {
          color: #e2e8f0;
          background: #1e293b;
          border-color: #334155;
        }

        .lightbox-toolbar .zoom-percentage {
          color: #cbd5e1;
        }

        .lightbox-close {
          display: grid;
          place-items: center;
          width: 35px;
          height: 35px;
          flex-shrink: 0;
          color: #f8fafc;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 10px;
          cursor: pointer;
        }

        .lightbox-image-stage {
          position: relative;
          flex: 1;
          min-height: 280px;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: radial-gradient(circle, #1e293b 0%, #020617 80%);
        }

        .lightbox-image-wrapper {
          position: relative;
          flex: 0 0 auto;
          width: min(75vh, 850px);
          max-width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #020617;
          border-radius: 10px;
        }

        .lightbox-image-wrapper img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          transform-origin: center center;
          transition: transform 180ms ease;
          pointer-events: none;
        }

        .lightbox-image-wrapper .lightbox-bbox {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .lightbox-footer {
          padding: 10px 18px;
          color: #94a3b8;
          background: #111c30;
          border-top: 1px solid #263449;
          font-size: 11px;
          line-height: 1.6;
        }

        .loading-indicator {
          display: inline-block;
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255, 255, 255, 0.45);
          border-top-color: white;
          border-radius: 999px;
          animation: analyze-spin 650ms linear infinite;
        }

        @keyframes analyze-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1100px) {
          .visual-grid-3,
          .derived-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .analytics-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .dermascope-analyze-page {
            padding: 14px;
            border-radius: 14px;
          }

          .analyze-header {
            flex-direction: column;
          }

          .analyze-header-tag {
            align-self: flex-start;
          }

          .upload-card,
          .result-card,
          .section-card {
            padding: 15px;
            border-radius: 17px;
          }

          .upload-dropzone {
            flex-wrap: wrap;
            padding: 16px;
          }

          .upload-file-button {
            margin-left: 68px;
          }

          .upload-actions .primary-button {
            width: 100%;
          }

          .result-topline {
            flex-direction: column;
          }

          .result-metrics {
            grid-template-columns: 1fr;
          }

          .visual-grid-3,
          .visual-grid-2,
          .visual-grid-1,
          .derived-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .visual-card {
            padding: 14px;
          }

          .derived-card {
            padding: 14px;
          }

          .visual-card-title {
            font-size: 14px;
          }

          .zoom-reset-button span {
            display: none;
          }

          .result-actions {
            flex-direction: column;
          }

          .result-actions button {
            width: 100%;
          }

          .lightbox-backdrop {
            padding: 8px;
          }

          .lightbox-panel {
            max-height: 96vh;
            border-radius: 14px;
          }

          .lightbox-toolbar {
            align-items: flex-start;
            padding: 11px;
          }

          .lightbox-toolbar-actions {
            gap: 5px;
          }

          .lightbox-toolbar .visual-zoom-controls {
            gap: 4px;
          }

          .lightbox-toolbar .zoom-reset-button {
            display: none;
          }

          .lightbox-image-stage {
            padding: 8px;
          }

          .lightbox-image-wrapper {
            width: min(82vw, 70vh);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dermascope-analyze-page *,
          .dermascope-analyze-page *::before,
          .dermascope-analyze-page *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <header className="analyze-header">
        <div>
          <div className="analyze-kicker">
            <Icon name="sparkles" size={15} />
            AI-POWERED DERMATOLOGY
          </div>

          <h1 className="analyze-title">Skin Analysis</h1>

          <p className="analyze-description">
            Upload a skin lesion image to generate a classification,
            model-attention heatmap, and U-Net lesion localization views.
          </p>
        </div>

        <div className="analyze-header-tag">
          <span className="status-dot" />
          <span>Analysis workspace</span>
        </div>
      </header>

      <div className="analyze-stack">
        {error && (
          <div className="error-banner" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Upload stays above the results; these sections are never side-by-side. */}
        <section className="upload-card">
          <div className="section-heading">
            <div>
              <h2 className="section-title">Upload lesion image</h2>
              <p className="section-description">
                Use a clear JPG, PNG, or WebP image. Maximum file size: 10 MB.
              </p>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileInput}
            hidden
          />

          <div
            className={`upload-dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Choose or drop a skin lesion image"
          >
            <div className="upload-icon-box">
              <Icon name="upload" size={25} />
            </div>

            <div className="upload-copy">
              <strong>
                {selectedFile ? selectedFile.name : "Drop your image here"}
              </strong>
              <span>
                {selectedFile
                  ? "Select another image or run the analysis below."
                  : "Drag and drop an image, or browse files from your computer."}
              </span>
            </div>

            <span className="upload-file-button">Browse files</span>
          </div>

          {previewUrl && selectedFile && (
            <div className="upload-preview-row">
              <img
                src={previewUrl}
                alt="Selected lesion preview"
                className="upload-preview-image"
              />

              <div className="upload-preview-info">
                <strong>{selectedFile.name}</strong>
                <span>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready
                  for analysis
                </span>
              </div>

              <button
                type="button"
                className="outline-button"
                onClick={() => inputRef.current?.click()}
              >
                Change
              </button>
            </div>
          )}

          <div className="upload-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleAnalyze}
              disabled={!selectedFile || loading}
            >
              {loading ? (
                <>
                  <span className="loading-indicator" />
                  Analyzing image…
                </>
              ) : (
                <>
                  <Icon name="scan" size={17} />
                  Analyze image
                </>
              )}
            </button>
          </div>
        </section>

        {loading && (
          <section className="result-card" aria-live="polite">
            <div className="result-label">
              <span className="status-dot" />
              ANALYSIS IN PROGRESS
            </div>
            <h2 className="section-title" style={{ marginTop: 12 }}>
              Processing your image
            </h2>
            <p className="muted-text">
              The classifier, Grad-CAM generator, and lesion segmentation
              pipeline are processing the uploaded image.
            </p>
          </section>
        )}

        {result && !loading && (
          <section className="result-card">
            <div className="result-topline">
              <div>
                <div className="result-label">
                  <Icon name="check" size={15} />
                  ANALYSIS COMPLETE
                </div>

                <h2 className="result-prediction">{result.prediction}</h2>

                <p className="result-meta">
                  File: {result.fileName}
                  {result.scanId != null && ` · Scan #${result.scanId}`}
                </p>
              </div>

              <span className="confidence-pill">
                Confidence {formatConfidence(result.confidence)}
              </span>
            </div>

            <div className="result-metrics">
              <div className="result-metric">
                <span className="metric-label">Predicted class</span>
                <strong className="metric-value">{result.prediction}</strong>
              </div>

              <div className="result-metric">
                <span className="metric-label">Affected area</span>
                <strong className="metric-value">
                  {formatPercent(result.localization.areaAffectedPercent)}
                </strong>
              </div>

              <div className="result-metric">
                <span className="metric-label">Inference latency</span>
                <strong className="metric-value">
                  {result.inferenceTime != null
                    ? `${Number(result.inferenceTime).toFixed(0)} ms`
                    : "—"}
                </strong>
              </div>
            </div>

            {caseOptions.length > 1 && (
              <div style={{ marginTop: 18 }}>
                <label
                  htmlFor="dermascope-case-switcher"
                  className="metric-label"
                  style={{ marginBottom: 7 }}
                >
                  Recent analysis cases
                </label>

                <select
                  id="dermascope-case-switcher"
                  className="case-switcher"
                  value={selectedCase}
                  onChange={handleCaseChange}
                >
                  {caseOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fileName} — {item.prediction}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="result-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleFlagForReview}
                disabled={reviewFlagged}
              >
                <Icon name="flag" size={16} />
                {reviewFlagged ? "Flagged for review" : "Flag for review"}
              </button>

              <button
                type="button"
                className="outline-button"
                onClick={handleExportReport}
                disabled={exporting}
              >
                <Icon name="download" size={16} />
                {exporting ? "Preparing report…" : "Export PDF report"}
              </button>
            </div>
          </section>
        )}
      </div>

      {result && !loading && (
        <>
          <section className="visualization-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">AI visualization workspace</h2>
                <p className="section-description">
                  Select the views you want to compare. Zoom controls on each
                  card work independently.
                </p>
              </div>
            </div>

            <div className="visual-controls-card">
              <h3 className="section-title" style={{ fontSize: 14 }}>
                Visualization filters
              </h3>

              <div className="view-checkbox-list">
                {VIEW_OPTIONS.map((option) => (
                  <label className="view-checkbox" key={option.id}>
                    <input
                      type="checkbox"
                      checked={selectedViews.includes(option.id)}
                      onChange={() => toggleView(option.id)}
                    />

                    <span className="view-checkbox-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {selectedViews.length === 0 ? (
              <div className="empty-views">
                <div className="empty-views-icon">
                  <Icon name="image" size={25} />
                </div>
                <h3>No visualization selected</h3>
                <p>
                  Enable one or more visualization cards to inspect the
                  model&apos;s attention and the segmented lesion.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setSelectedViews(DEFAULT_VIEWS)}
                >
                  Restore default views
                </button>
              </div>
            ) : (
              <div className={gridClass}>
                {selectedViews.includes("gradcam") && (
                  <VisualCard
                    key="gradcam"
                    cardId="gradcam"
                    title="Grad-CAM"
                    subtitle="Regions influencing the model prediction."
                    imageUrl={gradcamUrl}
                    result={result}
                    zoom={getCardZoom("gradcam")}
                    onZoomIn={() => changeCardZoom("gradcam", 0.25)}
                    onZoomOut={() => changeCardZoom("gradcam", -0.25)}
                    onResetZoom={() => resetCardZoom("gradcam")}
                    onOpen={openLightbox}
                    type="gradcam"
                    badge="AI ATTENTION"
                    isDark={isDark}
                  />
                )}

                {selectedViews.includes("binary-mask") && (
                  <VisualCard
                    key="binary-mask"
                    cardId="binary-mask"
                    title="Binary Mask"
                    subtitle="Foreground lesion pixels from U-Net."
                    imageUrl={binaryMaskUrl}
                    result={result}
                    zoom={getCardZoom("binary-mask")}
                    onZoomIn={() => changeCardZoom("binary-mask", 0.25)}
                    onZoomOut={() => changeCardZoom("binary-mask", -0.25)}
                    onResetZoom={() => resetCardZoom("binary-mask")}
                    onOpen={openLightbox}
                    type="binary-mask"
                    badge="U-NET MASK"
                    isDark={isDark}
                  />
                )}

                {selectedViews.includes("bounding-box") && (
                  <div
                    style={{
                      "--shared-image-zoom": getCardZoom("bounding-box"),
                      minWidth: 0,
                    }}
                  >
                    <VisualCard
                      key="bounding-box"
                      cardId="bounding-box"
                      title="Bounding Box"
                      subtitle="Tight outline around the detected mask region."
                      imageUrl={previewUrl}
                      result={result}
                      zoom={getCardZoom("bounding-box")}
                      onZoomIn={() => changeCardZoom("bounding-box", 0.25)}
                      onZoomOut={() => changeCardZoom("bounding-box", -0.25)}
                      onResetZoom={() => resetCardZoom("bounding-box")}
                      onOpen={openLightbox}
                      type="bounding-box"
                      bbox={bbox}
                      badge="LOCALIZATION"
                      isDark={isDark}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* This U-Net section is deliberately separate from the toggle grid. */}
          <section className="derived-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">U-Net Derived View</h2>
                <p className="section-description">
                  Compare the source image, binary segmentation mask, and
                  isolated lesion region.
                </p>
              </div>

              <span className="visual-badge">SEGMENTATION OUTPUT</span>
            </div>

            <div className="derived-grid">
              <article className="derived-card">
                <div className="derived-card-heading">
                  <h3>Original</h3>
                  <p>Uploaded skin lesion image.</p>
                </div>

                <ZoomControls
                  zoom={getCardZoom("unet-original")}
                  onZoomIn={() => changeCardZoom("unet-original", 0.25)}
                  onZoomOut={() => changeCardZoom("unet-original", -0.25)}
                  onReset={() => resetCardZoom("unet-original")}
                />

                <button
                  type="button"
                  className="derived-image-area"
                  onClick={() =>
                    openLightbox({
                      cardId: "unet-original",
                      title: "Original",
                      imageUrl: previewUrl,
                      type: "image",
                    })
                  }
                  aria-label="Enlarge original image"
                >
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Original lesion"
                      style={{
                        transform: `scale(${getCardZoom("unet-original")})`,
                      }}
                    />
                  )}
                </button>

                <p className="derived-footer">
                  Source image used for classification and segmentation.
                </p>
              </article>

              <article className="derived-card">
                <div className="derived-card-heading">
                  <h3>Binary Mask</h3>
                  <p>White foreground on a black background.</p>
                </div>

                <ZoomControls
                  zoom={getCardZoom("unet-mask")}
                  onZoomIn={() => changeCardZoom("unet-mask", 0.25)}
                  onZoomOut={() => changeCardZoom("unet-mask", -0.25)}
                  onReset={() => resetCardZoom("unet-mask")}
                />

                <button
                  type="button"
                  className="derived-image-area"
                  onClick={() =>
                    openLightbox({
                      cardId: "unet-mask",
                      title: "Binary Mask",
                      imageUrl: binaryMaskUrl,
                      type: "binary-mask",
                    })
                  }
                  aria-label="Enlarge binary mask"
                >
                  {binaryMaskUrl && (
                    <img
                      src={binaryMaskUrl}
                      alt="U-Net binary mask"
                      style={{
                        transform: `scale(${getCardZoom("unet-mask")})`,
                      }}
                    />
                  )}
                </button>

                <p className="derived-footer">
                  Pixels selected by the U-Net segmentation output.
                </p>
              </article>

              <article className="derived-card">
                <div className="derived-card-heading">
                  <h3>Segmented Lesion</h3>
                  <p>
                    Isolated lesion region generated from the U-Net binary
                    mask.
                  </p>
                </div>

                <ZoomControls
                  zoom={getCardZoom("segmented-lesion")}
                  onZoomIn={() =>
                    changeCardZoom("segmented-lesion", 0.25)
                  }
                  onZoomOut={() =>
                    changeCardZoom("segmented-lesion", -0.25)
                  }
                  onReset={() => resetCardZoom("segmented-lesion")}
                />

                <button
                  type="button"
                  className="derived-image-area"
                  onClick={() =>
                    openLightbox({
                      cardId: "segmented-lesion",
                      title: "Segmented Lesion",
                      imageUrl: segmentedLesionUrl,
                      type: "segmented-lesion",
                    })
                  }
                  aria-label="Enlarge segmented lesion"
                >
                  {segmentedLesionUrl ? (
                    <img
                      src={segmentedLesionUrl}
                      alt="Isolated segmented lesion"
                      className="segmented-lesion-image"
                      style={{
                        transform: `scale(${getCardZoom("segmented-lesion")})`,
                      }}
                    />
                  ) : (
                    <div className="visual-placeholder">
                      <Icon name="scan" size={26} />
                      <span>Preparing segmented lesion…</span>
                    </div>
                  )}
                </button>

                <p className="derived-footer">
                  Pixels outside the predicted lesion mask are transparent.
                </p>
              </article>
            </div>
          </section>

          <section className="analytics-grid">
            <div className="section-card">
              <div className="section-heading">
                <div>
                  <h2 className="section-title">Class probabilities</h2>
                  <p className="section-description">
                    Confidence distribution returned by the classifier.
                  </p>
                </div>
              </div>

              {renderProbabilities()}
            </div>

            <div className="section-card">
              <div className="section-heading">
                <div>
                  <h2 className="section-title">Localization metrics</h2>
                  <p className="section-description">
                    Measurements calculated from the U-Net mask.
                  </p>
                </div>
              </div>

              <div className="localization-list">
                <div className="localization-row">
                  <span>Affected area</span>
                  <strong>
                    {formatPercent(result.localization.areaAffectedPercent)}
                  </strong>
                </div>

                <div className="localization-row">
                  <span>Lesion pixels</span>
                  <strong>
                    {result.localization.areaPixels != null
                      ? formatNumber(result.localization.areaPixels)
                      : "—"}
                  </strong>
                </div>

                <div className="localization-row">
                  <span>Perimeter</span>
                  <strong>
                    {result.localization.perimeterPixels != null
                      ? `${Number(
                          result.localization.perimeterPixels
                        ).toFixed(2)} px`
                      : "—"}
                  </strong>
                </div>

                <div className="localization-row">
                  <span>Bounding box</span>
                  <strong>
                    {bbox
                      ? `${Math.round(bbox.width)} × ${Math.round(
                          bbox.height
                        )} px`
                      : "Not detected"}
                  </strong>
                </div>

                <div className="localization-row">
                  <span>Coordinate space</span>
                  <strong>224 × 224 px</strong>
                </div>
              </div>
            </div>
          </section>

          <div className="disclaimer">
            <Icon name="alert" size={17} />
            <div>
              <strong>Clinical disclaimer:</strong> This AI-generated
              classification and segmentation are intended for research and
              decision support, not as a standalone medical diagnosis.
              Confidence scores are model outputs and do not establish the
              presence or absence of a disease. Consult a qualified healthcare
              professional for clinical assessment.
            </div>
          </div>
        </>
      )}

      {lightbox && (
        <div
          className="lightbox-backdrop"
          onClick={closeLightbox}
          role="presentation"
        >
          <div
            className="lightbox-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${lightbox.title} enlarged view`}
          >
            <div className="lightbox-toolbar">
              <div className="lightbox-heading">
                <h3>{lightbox.title}</h3>
                <p>Use zoom controls to inspect image details.</p>
              </div>

              <div className="lightbox-toolbar-actions">
                <ZoomControls
                  zoom={lightboxZoom}
                  compact
                  onZoomIn={() =>
                    setLightboxZoom((zoom) => clamp(zoom + 0.25, 1, 4))
                  }
                  onZoomOut={() =>
                    setLightboxZoom((zoom) => clamp(zoom - 0.25, 1, 4))
                  }
                  onReset={() => setLightboxZoom(1)}
                />

                <button
                  type="button"
                  className="lightbox-close"
                  onClick={closeLightbox}
                  aria-label="Close enlarged image"
                  title="Close"
                >
                  <Icon name="close" size={19} />
                </button>
              </div>
            </div>

            <div className="lightbox-image-stage">
              <div className="lightbox-image-wrapper">
                <img
                  src={lightbox.imageUrl}
                  alt={lightbox.title}
                  style={{
                    transform: `scale(${lightboxZoom})`,
                  }}
                />

                {lightbox.type === "bounding-box" && bbox && (
                  <svg
                    className="lightbox-bbox"
                    viewBox={`0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}`}
                    preserveAspectRatio="none"
                  >
                    <rect
                      x={bbox.x}
                      y={bbox.y}
                      width={bbox.width}
                      height={bbox.height}
                      fill="none"
                      stroke="#00ff88"
                      strokeWidth="1.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="lightbox-footer">
              Zoom: {Math.round(lightboxZoom * 100)}% · Press + or − to zoom,
              0 to reset, or Escape to close.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
