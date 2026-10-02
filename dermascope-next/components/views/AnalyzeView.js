'use client';

import { useEffect, useRef, useState } from 'react';
import LesionPhoto from '../ui/LesionPhoto';

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const OVERLAYS = [
  { key: 'heat', label: 'Grad-CAM' },
  { key: 'mask', label: 'U-Net mask' },
  { key: 'box', label: 'Bounding box' },
];

const EMPTY_RESULT = {
  prediction: null,
  confidence: null,
  probabilities: [],
  localization: [],
  gradcamUrl: null,
  maskUrl: null,
  boundingBox: null,
  overlap: null,
  inferenceTime: null,
};

/*
Expected backend response.

Later your FastAPI backend should return something similar to:

{
  "prediction": "Basal Cell Carcinoma",
  "confidence": 94.2,

  "probabilities": [
    {
      "label": "Basal Cell Carcinoma",
      "pct": 94.2
    },
    {
      "label": "Melanoma",
      "pct": 2.1
    },
    {
      "label": "Melanocytic Nevi",
      "pct": 2.4
    },
    {
      "label": "Warts, Molluscum and other Viral Infections",
      "pct": 1.3
    }
  ],

  "localization": [
    {
      "label": "Lesion area",
      "value": "31.4%"
    },
    {
      "label": "Bounding box",
      "value": "126 × 119 px"
    },
    {
      "label": "Mask confidence",
      "value": "91.7%"
    },
    {
      "label": "IoU with Grad-CAM",
      "value": "71.0%"
    }
  ],

  "gradcam_url": "/results/gradcam/abc.png",
  "mask_url": "/results/mask/abc.png",

  "bounding_box": {
    "x": 42,
    "y": 31,
    "width": 126,
    "height": 119
  },

  "overlap": 71.0,

  "inference_time": 2.1
}
*/

export default function AnalyzeView() {
  // ------------------------------------------------------------
  // Image state
  // ------------------------------------------------------------

  const [selectedFile, setSelectedFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);

  // ------------------------------------------------------------
  // UI state
  // ------------------------------------------------------------

  const [overlay, setOverlay] = useState('heat');
  const [mode, setMode] = useState('single');
  const [isDragging, setIsDragging] = useState(false);

  // ------------------------------------------------------------
  // Analysis state
  // ------------------------------------------------------------

  const [result, setResult] = useState(EMPTY_RESULT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // ------------------------------------------------------------
  // History / action state
  // ------------------------------------------------------------

  const [isSaving, setIsSaving] = useState(false);
  const [isFlagging, setIsFlagging] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // ------------------------------------------------------------
  // File input
  // ------------------------------------------------------------

  const fileInputRef = useRef(null);

  // ------------------------------------------------------------
  // Backend URL
  // ------------------------------------------------------------

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // ------------------------------------------------------------
  // Cleanup object URL
  // ------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  // ------------------------------------------------------------
  // Reset analysis whenever a new image is selected
  // ------------------------------------------------------------

  const resetAnalysis = () => {
    setResult(EMPTY_RESULT);
    setError(null);
    setActionMessage(null);
    setOverlay('heat');
  };

  // ------------------------------------------------------------
  // Validate image
  // ------------------------------------------------------------

  const validateFile = (file) => {
    if (!file) {
      return 'No image was selected.';
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Unsupported image type. Please use JPG, JPEG, PNG, or WebP.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Image is too large. Maximum allowed size is 10 MB.';
    }

    return null;
  };

  // ------------------------------------------------------------
  // Select image
  // ------------------------------------------------------------

  const handleImageUpload = (file) => {
    if (!file) return;

    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setActionMessage(null);

    // Revoke old object URL before replacing it.
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const newImageUrl = URL.createObjectURL(file);

    setSelectedFile(file);
    setImageUrl(newImageUrl);
    setImageDimensions(null);

    resetAnalysis();

    // Read actual image dimensions.
    const img = new Image();

    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };

    img.src = newImageUrl;
  };

  // ------------------------------------------------------------
  // File picker
  // ------------------------------------------------------------

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      handleImageUpload(file);
    }

    // Allow selecting the same file again.
    event.target.value = '';
  };

  // ------------------------------------------------------------
  // Open file picker
  // ------------------------------------------------------------

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // ------------------------------------------------------------
  // Drag events
  // ------------------------------------------------------------

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      handleImageUpload(file);
    }
  };

  // ------------------------------------------------------------
  // Remove image
  // ------------------------------------------------------------

  const handleRemoveImage = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    setSelectedFile(null);
    setImageUrl(null);
    setImageDimensions(null);
    setResult(EMPTY_RESULT);
    setError(null);
    setActionMessage(null);
    setOverlay('heat');
  };

  // ------------------------------------------------------------
  // Analyze image
  // ------------------------------------------------------------

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError('Please upload an image before starting analysis.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setActionMessage(null);
    setResult(EMPTY_RESULT);

    try {
      const formData = new FormData();

      formData.append('file', selectedFile);

      /*
       * This is the endpoint we will implement in FastAPI.
       *
       * POST:
       * http://localhost:8000/predict
       *
       * Body:
       * multipart/form-data
       * file=<image>
       */
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let message = `Analysis failed (${response.status}).`;

        try {
          const errorData = await response.json();

          if (errorData?.detail) {
            message = errorData.detail;
          } else if (errorData?.message) {
            message = errorData.message;
          }
        } catch {
          // Keep default error message.
        }

        throw new Error(message);
      }

      const data = await response.json();

      // Normalize backend response.
      const normalizedResult = normalizeResult(data);

      setResult(normalizedResult);
    } catch (err) {
      console.error('Analysis error:', err);

      if (
        err instanceof TypeError &&
        err.message.toLowerCase().includes('fetch')
      ) {
        setError(
          `Backend is not connected. Start the FastAPI server at ${API_URL} and try again.`
        );
      } else {
        setError(
          err?.message ||
            'Unable to analyze this image. Please try again.'
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ------------------------------------------------------------
  // Normalize backend result
  // ------------------------------------------------------------

  const normalizeResult = (data) => {
    const probabilities = Array.isArray(data?.probabilities)
      ? data.probabilities.map((item) => ({
          label: item.label ?? item.name ?? 'Unknown',
          pct: Number(
            item.pct ??
              item.probability ??
              item.confidence ??
              0
          ),
        }))
      : [];

    const localization = Array.isArray(data?.localization)
      ? data.localization.map((item) => ({
          label: item.label ?? 'Metric',
          value: item.value ?? '—',
        }))
      : [];

    return {
      prediction:
        data?.prediction ??
        data?.predicted_class ??
        data?.class_name ??
        null,

      confidence:
        data?.confidence !== undefined &&
        data?.confidence !== null
          ? Number(data.confidence)
          : null,

      probabilities,

      localization,

      gradcamUrl:
        data?.gradcam_url ??
        data?.gradcam ??
        data?.grad_cam_url ??
        null,

      maskUrl:
        data?.mask_url ??
        data?.mask ??
        data?.unet_mask_url ??
        null,

      boundingBox:
        data?.bounding_box ??
        data?.bbox ??
        null,

      overlap:
        data?.overlap !== undefined &&
        data?.overlap !== null
          ? Number(data.overlap)
          : null,

      inferenceTime:
        data?.inference_time !== undefined &&
        data?.inference_time !== null
          ? Number(data.inference_time)
          : null,
    };
  };

  // ------------------------------------------------------------
  // Save to history
  // ------------------------------------------------------------

  const handleSaveHistory = async () => {
    if (!selectedFile || !result.prediction) {
      return;
    }

    setIsSaving(true);
    setActionMessage(null);

    try {
      /*
       * This endpoint will be implemented later in FastAPI.
       *
       * POST /history
       *
       * It can accept the original image and the analysis result.
       */
      const formData = new FormData();

      formData.append('file', selectedFile);
      formData.append('prediction', result.prediction);
      formData.append(
        'confidence',
        String(result.confidence ?? '')
      );
      formData.append(
        'result',
        JSON.stringify(result)
      );

      const response = await fetch(`${API_URL}/history`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Unable to save this analysis.');
      }

      setActionMessage('Analysis saved to history.');
    } catch (err) {
      console.error('Save history error:', err);

      setActionMessage(
        err?.message ||
          `History backend is not connected.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------------------
  // Flag for manual review
  // ------------------------------------------------------------

  const handleFlagReview = async () => {
    if (!result.prediction) {
      return;
    }

    setIsFlagging(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${API_URL}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prediction: result.prediction,
          confidence: result.confidence,
          image_name: selectedFile?.name ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to flag this analysis.');
      }

      setActionMessage('Analysis flagged for manual review.');
    } catch (err) {
      console.error('Manual review error:', err);

      setActionMessage(
        err?.message ||
          'Review backend is not connected yet.'
      );
    } finally {
      setIsFlagging(false);
    }
  };

  // ------------------------------------------------------------
  // Download report
  // ------------------------------------------------------------

  const handleDownloadReport = async () => {
    if (!selectedFile || !result.prediction) {
      return;
    }

    try {
      /*
       * This endpoint will later generate the actual PDF.
       *
       * GET /reports/{id}
       *
       * For now we don't generate a fake PDF in the browser.
       */
      const response = await fetch(
        `${API_URL}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: selectedFile.name,
            result,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Report service is not available yet.');
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `dermascope-report-${Date.now()}.pdf`;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Report error:', err);

      setActionMessage(
        err?.message ||
          'Report generation is not connected yet.'
      );
    }
  };

  // ------------------------------------------------------------
  // Format confidence
  // ------------------------------------------------------------

  const formattedConfidence =
    result.confidence !== null
      ? `${result.confidence.toFixed(1)}%`
      : '—';

  // ------------------------------------------------------------
  // Format inference time
  // ------------------------------------------------------------

  const formattedInferenceTime =
    result.inferenceTime !== null
      ? `${result.inferenceTime.toFixed(2)}s total`
      : 'Awaiting analysis';

  // ------------------------------------------------------------
  // Bounding box style
  // ------------------------------------------------------------

  const getBoundingBoxStyle = () => {
    if (!result.boundingBox || !imageDimensions) {
      return {};
    }

    const box = result.boundingBox;

    const left =
      (Number(box.x ?? 0) / imageDimensions.width) * 100;

    const top =
      (Number(box.y ?? 0) / imageDimensions.height) * 100;

    const width =
      (Number(box.width ?? 0) / imageDimensions.width) * 100;

    const height =
      (Number(box.height ?? 0) / imageDimensions.height) * 100;

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
    };
  };

  // ------------------------------------------------------------
  // Has result?
  // ------------------------------------------------------------

  const hasResult = Boolean(result.prediction);

  return (
    <div>

      {/* ====================================================== */}
      {/* SCREENING NOTICE */}
      {/* ====================================================== */}

      <div className="bg-[var(--gold-dim)] border border-[var(--line)] rounded-[3px] px-3.5 py-2.5 text-[12.5px] mb-5">
        <strong className="text-[var(--gold)]">
          Screening aid only
        </strong>{' '}
        — not a medical diagnosis. Always consult a dermatologist
        for confirmation.
      </div>

      {/* ====================================================== */}
      {/* MODEL STATUS */}
      {/* ====================================================== */}

      <div className="flex gap-2.5 mb-[18px] flex-wrap">

        <div className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-[var(--line)] rounded-full bg-[var(--panel)]">

          <span
            className={`w-3.5 h-3.5 rounded-full text-white flex items-center justify-center text-[9px] ${
              hasResult
                ? 'bg-[var(--teal)]'
                : 'bg-[var(--muted)]'
            }`}
          >
            {hasResult ? '✓' : '•'}
          </span>

          Classifier (EfficientNetV2S)

          <span className="font-mono text-[var(--muted)]">
            {hasResult
              ? `${result.inferenceTime ?? '—'}s`
              : 'ready'}
          </span>

        </div>

        <div className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-[var(--line)] rounded-full bg-[var(--panel)]">

          <span
            className={`w-3.5 h-3.5 rounded-full text-white flex items-center justify-center text-[9px] ${
              hasResult
                ? 'bg-[var(--teal)]'
                : 'bg-[var(--muted)]'
            }`}
          >
            {hasResult ? '✓' : '•'}
          </span>

          Localization (U-Net)

          <span className="font-mono text-[var(--muted)]">
            {hasResult ? 'complete' : 'ready'}
          </span>

        </div>

      </div>

      {/* ====================================================== */}
      {/* ERROR */}
      {/* ====================================================== */}

      {error && (
        <div className="mb-4 border border-[var(--line)] bg-[var(--gold-dim)] rounded-[3px] px-3.5 py-3 text-[12px]">
          <div className="font-bold text-[var(--gold)] mb-1">
            Unable to continue
          </div>

          <div className="text-[var(--muted)]">
            {error}
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* MAIN GRID */}
      {/* ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-[18px]">

        {/* ==================================================== */}
        {/* IMAGE PANEL */}
        {/* ==================================================== */}

        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden">

          {/* Header */}

          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">

            <h3 className="text-[13px] font-bold m-0">
              Input image
            </h3>

            <span className="text-[11px] text-[var(--muted)] font-mono truncate max-w-[220px]">
              {selectedFile
                ? selectedFile.name
                : 'No image selected'}
            </span>

          </div>

          {/* ================================================== */}
          {/* UPLOAD */}
          {/* ================================================== */}

          <div className="px-4 pt-3.5">

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={openFilePicker}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' ||
                  event.key === ' '
                ) {
                  openFilePicker();
                }
              }}
              className={`border border-dashed rounded-[3px] p-4 mb-3.5 flex items-center justify-between gap-3 text-[12.5px] cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[var(--teal)] bg-[var(--teal-dim)]'
                  : 'border-[var(--line)] hover:border-[var(--teal)]'
              }`}
            >

              <div className="min-w-0">

                <div className="text-[var(--ink)] font-medium">
                  {isDragging
                    ? 'Drop image here'
                    : selectedFile
                      ? 'Image selected'
                      : 'Drag an image here or click to browse'}
                </div>

                <div className="text-[11px] text-[var(--muted)] mt-1">
                  JPG, PNG, WebP · maximum 10 MB
                </div>

              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openFilePicker();
                }}
                className="shrink-0 text-[12px] px-3 py-1.5 rounded-full border border-[var(--line)] bg-transparent cursor-pointer hover:border-[var(--teal)]"
              >
                Choose image
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

            </div>

            {/* Selected file information */}

            {selectedFile && (
              <div className="flex items-center justify-between gap-3 mb-3.5 px-3 py-2 border border-[var(--line)] rounded-[3px]">

                <div className="min-w-0">

                  <div className="text-[12px] font-medium truncate">
                    {selectedFile.name}
                  </div>

                  <div className="text-[10.5px] text-[var(--muted)] font-mono mt-0.5">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    {imageDimensions &&
                      ` · ${imageDimensions.width}×${imageDimensions.height}`}
                  </div>

                </div>

                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-[var(--line)] bg-transparent cursor-pointer"
                >
                  Remove
                </button>

              </div>
            )}

          </div>

          {/* ================================================== */}
          {/* IMAGE / RESULT VISUALIZATION */}
          {/* ================================================== */}

          <div className="flex gap-1.5 px-4 pb-3">

            {['single', 'split'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={!selectedFile}
                className={`font-mono text-[11px] px-2.5 py-1 border rounded-[4px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  mode === m
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                    : 'bg-[var(--panel)] text-[var(--muted)] border-[var(--line)]'
                }`}
              >
                {m === 'single'
                  ? 'Single overlay'
                  : 'Compare side-by-side'}
              </button>
            ))}

          </div>

          {/* ================================================== */}
          {/* SINGLE MODE */}
          {/* ================================================== */}

          {mode === 'single' ? (

            <LesionPhoto
              className="aspect-[4/3] mx-4 mb-3.5 rounded-md"
              style={{
                background: '#1b1410',
              }}
            >

              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Uploaded lesion"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--muted)]">
                  Upload a lesion image to begin
                </div>
              )}

              {/* Grad-CAM */}

              {result.gradcamUrl && (
                <img
                  src={result.gradcamUrl}
                  alt="Grad-CAM visualization"
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                    overlay === 'heat'
                      ? 'opacity-70'
                      : 'opacity-0'
                  }`}
                />
              )}

              {/* U-Net mask */}

              {result.maskUrl && (
                <img
                  src={result.maskUrl}
                  alt="U-Net lesion mask"
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                    overlay === 'mask'
                      ? 'opacity-50'
                      : 'opacity-0'
                  }`}
                />
              )}

              {/* Bounding box */}

              {result.boundingBox && (
                <div
                  className={`absolute border-2 border-[var(--teal)] pointer-events-none ${
                    overlay === 'box'
                      ? 'opacity-100'
                      : 'opacity-0'
                  }`}
                  style={getBoundingBoxStyle()}
                />
              )}

              {/* Overlay buttons */}

              {selectedFile && (
                <div className="absolute left-2.5 bottom-2.5 flex gap-1.5 flex-wrap z-[2]">

                  {OVERLAYS.map((item) => {

                    const available =
                      item.key === 'heat'
                        ? Boolean(result.gradcamUrl)
                        : item.key === 'mask'
                          ? Boolean(result.maskUrl)
                          : Boolean(result.boundingBox);

                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={!available}
                        onClick={() =>
                          setOverlay(item.key)
                        }
                        className={`font-mono text-[10.5px] px-2.5 py-1.5 rounded-full cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                          overlay === item.key
                            ? 'bg-[var(--teal)] border-[var(--teal)] text-white'
                            : 'bg-black/70 border-white/25 text-[#e9efec]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}

                </div>
              )}

            </LesionPhoto>

          ) : (

            /* ================================================= */
            /* SPLIT MODE */
            /* ================================================= */

            <div className="grid grid-cols-2 gap-0.5 mx-4 mb-3.5 rounded-md overflow-hidden bg-[var(--line)] aspect-[4/3]">

              <LesionPhoto>

                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Original lesion"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}

                {result.gradcamUrl && (
                  <img
                    src={result.gradcamUrl}
                    alt="Grad-CAM"
                    className="absolute inset-0 w-full h-full object-contain opacity-70"
                  />
                )}

                <span className="absolute top-2 left-2 font-mono text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded-full z-[2]">
                  Grad-CAM · Model 1
                </span>

              </LesionPhoto>

              <LesionPhoto>

                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Original lesion"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}

                {result.maskUrl && (
                  <img
                    src={result.maskUrl}
                    alt="U-Net mask"
                    className="absolute inset-0 w-full h-full object-contain opacity-50"
                  />
                )}

                <span className="absolute top-2 left-2 font-mono text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded-full z-[2]">
                  U-Net mask · Model 2
                </span>

              </LesionPhoto>

            </div>
          )}

          {/* ================================================== */}
          {/* EXPLANATION */}
          {/* ================================================== */}

          <div className="px-4 pb-4 text-[11px] text-[var(--muted)] flex gap-3.5 flex-wrap">

            <span>
              <b className="text-[var(--clay)]">●</b>{' '}
              Grad-CAM —{' '}
              <b className="text-[var(--ink)]">
                Model 1
              </b>
              , EfficientNetV2S classifier. It provides an
              approximate visualization of regions influencing the
              classification.
            </span>

            <span>
              <b className="text-[var(--teal)]">●</b>{' '}
              Mask / Bounding box —{' '}
              <b className="text-[var(--ink)]">
                Model 2
              </b>
              , U-Net. It provides lesion localization.
            </span>

          </div>

          {/* ================================================== */}
          {/* ANALYZE BUTTON */}
          {/* ================================================== */}

          <div className="px-4 pb-4">

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedFile || isAnalyzing}
              className="w-full font-bold text-[13px] px-4 py-2.5 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAnalyzing
                ? 'Analyzing image…'
                : selectedFile
                  ? 'Analyze image'
                  : 'Upload an image to analyze'}
            </button>

          </div>

        </div>

        {/* ==================================================== */}
        {/* RESULT PANEL */}
        {/* ==================================================== */}

        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[3px] overflow-hidden h-fit">

          {/* Header */}

          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">

            <h3 className="text-[13px] font-bold m-0">
              Result
            </h3>

            <span className="text-[11px] text-[var(--muted)] font-mono">
              {formattedInferenceTime}
            </span>

          </div>

          {/* ================================================== */}
          {/* NO RESULT */}
          {/* ================================================== */}

          {!hasResult && (
            <div className="px-4 py-8 text-center border-b border-[var(--line)]">

              <div className="text-[13px] font-bold mb-1">
                No analysis yet
              </div>

              <div className="text-[11.5px] text-[var(--muted)] leading-[1.5]">
                Upload a dermoscopic image and select{' '}
                <b>Analyze image</b>. The classifier and
                localization results will appear here.
              </div>

            </div>
          )}

          {/* ================================================== */}
          {/* RESULT */}
          {/* ================================================== */}

          {hasResult && (
            <>
              {/* Prediction */}

              <div className="flex justify-between gap-3.5 px-4 py-4 border-b border-[var(--line)]">

                <div className="min-w-0">

                  <p className="text-[11px] text-[var(--muted)] m-0 mb-1">
                    Predicted condition
                  </p>

                  <p className="text-[21px] font-extrabold tracking-tight m-0 text-[var(--clay)] break-words">
                    {result.prediction}
                  </p>

                </div>

                <div
                  className="gauge shrink-0"
                  style={{
                    background:
                      result.confidence !== null
                        ? `conic-gradient(var(--teal) 0% ${Math.max(
                            0,
                            Math.min(
                              100,
                              result.confidence
                            )
                          )}%, var(--teal-dim) ${Math.max(
                            0,
                            Math.min(
                              100,
                              result.confidence
                            )
                          )}% 100%)`
                        : 'var(--teal-dim)',
                  }}
                >
                  <span>
                    {formattedConfidence}
                  </span>
                </div>

              </div>

              {/* All classes */}

              <div className="px-4 py-3.5 border-b border-[var(--line)]">

                <h4 className="text-[11.5px] text-[var(--muted)] font-bold m-0 mb-2.5">
                  All classes
                </h4>

                {result.probabilities.length === 0 ? (
                  <div className="text-[11px] text-[var(--muted)]">
                    Class probabilities were not returned by the
                    backend.
                  </div>
                ) : (
                  result.probabilities.map((item) => (

                    <div
                      key={item.label}
                      className="grid grid-cols-[110px_1fr_44px] items-center gap-2.5 mb-1.5 text-[12px]"
                    >

                      <span className="truncate" title={item.label}>
                        {item.label}
                      </span>

                      <div className="h-[5px] bg-[var(--teal-dim)] rounded-[3px] overflow-hidden">

                        <span
                          className="block h-full bg-[var(--teal)]"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                item.pct
                              )
                            )}%`,
                          }}
                        />

                      </div>

                      <span className="font-mono text-right text-[var(--muted)]">
                        {item.pct.toFixed(1)}%
                      </span>

                    </div>

                  ))
                )}

              </div>

              {/* Localization */}

              <div className="grid grid-cols-2 gap-2.5 px-4 py-3.5 border-b border-[var(--line)]">

                <h4 className="col-span-2 text-[11.5px] text-[var(--muted)] font-bold m-0">
                  Localization (U-Net)
                </h4>

                {result.localization.length === 0 ? (
                  <div className="col-span-2 text-[11px] text-[var(--muted)]">
                    Localization statistics were not returned by
                    the backend.
                  </div>
                ) : (
                  result.localization.map((item) => (

                    <div
                      key={item.label}
                      className="border border-[var(--line)] rounded-[3px] px-2.5 py-2"
                    >

                      <div className="text-[10.5px] text-[var(--muted)] mb-1">
                        {item.label}
                      </div>

                      <div className="font-mono text-[14px] font-semibold">
                        {item.value}
                      </div>

                    </div>

                  ))
                )}

              </div>

              {/* Why prediction */}

              <details
                className="px-4 py-3.5 border-b border-[var(--line)]"
                open
              >

                <summary className="cursor-pointer text-[11.5px] text-[var(--muted)] font-bold list-none marker:hidden">
                  ▾ Why this prediction
                </summary>

                <p className="text-[12.5px] leading-[1.55] mt-2">
                  <b>Model 1 (classifier)</b> predicts the disease
                  class and confidence. Grad-CAM is used as an
                  approximate visualization of regions influencing
                  the classifier.
                </p>

                <p className="text-[12.5px] leading-[1.55] mt-2">
                  <b>Model 2 (U-Net)</b> is a separate localization
                  model. Its predicted mask is used to identify the
                  lesion region and derive localization measurements.
                </p>

                {result.overlap !== null && (
                  <p className="text-[12.5px] leading-[1.55] mt-2">
                    The calculated overlap between the Grad-CAM
                    region and U-Net localization is{' '}
                    <b>
                      {result.overlap.toFixed(1)}%
                    </b>
                    .
                  </p>
                )}

              </details>

              {/* Manual review */}

              <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-[var(--muted)] border-b border-[var(--line)]">

                <span>⚑</span>

                Unsure about this result?

                <button
                  type="button"
                  onClick={handleFlagReview}
                  disabled={isFlagging}
                  className="text-[var(--teal)] ml-auto bg-transparent border-0 cursor-pointer disabled:opacity-40"
                >
                  {isFlagging
                    ? 'Flagging…'
                    : 'Flag for manual review'}
                </button>

              </div>

            </>
          )}

          {/* ================================================== */}
          {/* ACTION MESSAGE */}
          {/* ================================================== */}

          {actionMessage && (
            <div className="px-4 py-2.5 text-[11px] text-[var(--muted)] border-b border-[var(--line)]">
              {actionMessage}
            </div>
          )}

          {/* ================================================== */}
          {/* ACTION BUTTONS */}
          {/* ================================================== */}

          <div className="px-4 py-3.5 flex gap-2 flex-wrap">

            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={!hasResult}
              className="font-bold text-[13px] px-4 py-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download report (PDF)
            </button>

            <button
              type="button"
              onClick={handleSaveHistory}
              disabled={!hasResult || isSaving}
              className="font-bold text-[13px] px-4 py-2 rounded-full border border-[var(--line)] bg-transparent text-[var(--ink)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving
                ? 'Saving…'
                : 'Save to history'}
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}