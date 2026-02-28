import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import beeLoungingAnimation from "./Animation/Bee - lounging.json";
import "./App.css";

const API_BASE_URL = (
  process.env.REACT_APP_API_URL || `http://${window.location.hostname}:8000`
).replace(/\/$/, "");

const toBackendUrl = (url) => {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

function App() {
  const [operationMode, setOperationMode] = useState("insert");
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [status, setStatus] = useState("idle");
  const [sheetsMessage, setSheetsMessage] = useState("");
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ documentType: "", file: "" });
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const insertFileInputRef = useRef(null);
  const updateFileInputRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          return prev;
        }
        const remaining = 95 - prev;
        const delta = Math.max(0.35, remaining * 0.08);
        return Math.min(95, Number((prev + delta).toFixed(2)));
      });
    }, 90);

    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    setDocumentType("");
    setFile(null);
    setIsDragging(false);
    setSpreadsheetId("");
    setStatus("idle");
    setSheetsMessage("");
    setSheetsUrl("");
    setDownloadMessage("");
    setDownloadUrl("");
    setFieldErrors({ documentType: "", file: "" });
    setSubmitError("");
    setLoading(false);
    setProgress(0);
    if (insertFileInputRef.current) {
      insertFileInputRef.current.value = "";
    }
    if (updateFileInputRef.current) {
      updateFileInputRef.current.value = "";
    }
  }, [operationMode]);

  const setFieldError = (field, message) => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  };

  const clearFieldError = (field) => {
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleFileChange = (nextFile) => {
    if (!nextFile) {
      return;
    }
    if (nextFile.type && nextFile.type !== "application/pdf") {
      setFieldError("file", "Only PDF files are supported.");
      return;
    }
    setFile(nextFile);
    clearFieldError("file");
    setSubmitError("");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (!documentType) {
      setFieldError("documentType", "Please choose document type.");
      return;
    }
    const droppedFile = event.dataTransfer.files?.[0] || null;
    handleFileChange(droppedFile);
  };

  const openFilePicker = (mode = operationMode) => {
    if (!documentType) {
      setFieldError("documentType", "Please choose document type.");
      return;
    }
    const targetRef = mode === "update" ? updateFileInputRef : insertFileInputRef;
    targetRef.current?.click();
  };

  const handleUpload = async (mode = operationMode) => {
    let hasError = false;

    if (!documentType) {
      setFieldError("documentType", "Please choose document type.");
      hasError = true;
    } else {
      clearFieldError("documentType");
    }

    if (!file) {
      setFieldError("file", "Please select a PDF.");
      hasError = true;
    } else {
      clearFieldError("file");
    }

    if (hasError) {
      return;
    }

    const formData = new FormData();
    formData.append("document_type", documentType);
    formData.append("operation_mode", mode);
    formData.append("pdf", file);
    if (spreadsheetId.trim()) {
      formData.append("spreadsheet_id", spreadsheetId.trim());
    }

    setLoading(true);
    setStatus("loading");
    setProgress(2);
    setSheetsMessage("");
    setSheetsUrl("");
    setDownloadMessage("");
    setDownloadUrl("");
    setSubmitError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const message =
          isJson && payload?.errors
            ? Object.values(payload.errors).flat().join(" ")
            : isJson && payload?.message
            ? payload.message
            : typeof payload === "string"
            ? payload.slice(0, 300)
            : "Upload failed.";
        throw new Error(message);
      }

      if (!isJson) {
        throw new Error("Server returned non-JSON response. Check backend logs.");
      }

      const sheetInfo = payload?.google_sheets || {};
      setSheetsMessage(sheetInfo.message || "");
      setSheetsUrl(sheetInfo.spreadsheet_url || "");
      const downloadInfo = payload?.downloadable_sheet || {};
      setDownloadMessage(downloadInfo.message || "");
      setDownloadUrl(toBackendUrl(downloadInfo.download_url || ""));
      setProgress(100);
      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setSubmitError(error.message || "Upload failed.");
    } finally {
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 260);
    }
  };

  const renderCardFace = (mode, inputRef) => {
    const isUpdate = mode === "update";

    return (
      <>
        <span className="eyebrow">PDF Extractor</span>
        <h1>Document Parser</h1>
        <p className="subtitle">
          {isUpdate
            ? "Upload a PDF to update the current sheet content with fresh extracted data."
            : "Upload a PDF to insert a new result block into your sheet."}
        </p>

        <div className="doc-type-wrap">
          <p className="doc-type-label">Document Type</p>
          <div className="doc-type-options" role="radiogroup" aria-label="Document Type">
            <label className={`doc-type-option ${documentType === "OIL" ? "active" : ""}`}>
              <input
                type="radio"
                name={`documentType-${mode}`}
                value="OIL"
                checked={documentType === "OIL"}
                onChange={(e) => {
                  setDocumentType(e.target.value);
                  clearFieldError("documentType");
                  setSubmitError("");
                }}
              />
              <span>OIL</span>
            </label>
            <label className={`doc-type-option ${documentType === "YGN" ? "active" : ""}`}>
              <input
                type="radio"
                name={`documentType-${mode}`}
                value="YGN"
                checked={documentType === "YGN"}
                onChange={(e) => {
                  setDocumentType(e.target.value);
                  clearFieldError("documentType");
                  setSubmitError("");
                }}
              />
              <span>YGN</span>
            </label>
          </div>
          {fieldErrors.documentType && <p className="input-error">{fieldErrors.documentType}</p>}
        </div>

        <div className="controls">
          <div
            className={`dropzone ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""} ${
              !documentType ? "disabled" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              if (documentType) {
                setIsDragging(true);
              }
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => openFilePicker(mode)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openFilePicker(mode);
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              disabled={!documentType}
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            <div className="dropzone-content">
              <p className="dropzone-title">{file ? "PDF Ready" : "Drag & drop your PDF here"}</p>
              <p className="dropzone-subtitle">
                {file ? "Click to replace file" : "or click to browse from your device"}
              </p>
            </div>
          </div>
          <button className="upload-btn" onClick={() => handleUpload(mode)} disabled={loading}>
            {loading ? (isUpdate ? "Updating..." : "Inserting...") : isUpdate ? "Update Sheet" : "Insert Data"}
          </button>
        </div>
        {fieldErrors.file && <p className="input-error">{fieldErrors.file}</p>}
        {submitError && <p className="input-error">{submitError}</p>}

        <p className="file-name">{file ? `Selected: ${file.name}` : "No file selected."}</p>

        {loading && (
          <div className="progress-wrap" aria-live="polite" aria-label="Upload progress">
            <div className="progress-head">
              <span>{isUpdate ? "Updating" : "Inserting"}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <section className="status-card">
          {status === "idle" && (
            <p className="status-hint">
              {isUpdate
                ? "Choose a PDF to update current sheet data."
                : "Choose a PDF to insert new sheet data."}
            </p>
          )}
          {status === "loading" && (
            <div className="loading-wrap" role="status" aria-live="polite" aria-label="Loading">
              <Lottie className="loading-lottie" animationData={beeLoungingAnimation} loop />
            </div>
          )}
          {status === "success" && (
            <div className="success-wrap" role="status" aria-live="polite">
              <span className="success-check" aria-hidden="true" />
              <p className="success-text">Extraction complete</p>
              {sheetsUrl && (
                <a className="sheet-link" href={sheetsUrl} target="_blank" rel="noreferrer">
                  Open Google Sheet
                </a>
              )}
              {downloadUrl && (
                <a className="sheet-link" href={downloadUrl}>
                  Download Sheet File
                </a>
              )}
            </div>
          )}
        </section>
      </>
    );
  };

  return (
    <main className="app-shell">
      <div className="bg-blob blob-a" aria-hidden="true" />
      <div className="bg-blob blob-b" aria-hidden="true" />

      <div className="card-stack">
        <div className="mode-toggle" role="group" aria-label="Operation mode">
          <button
            type="button"
            className={`mode-btn ${operationMode === "insert" ? "active" : ""}`}
            onClick={() => setOperationMode("insert")}
          >
            Insert
          </button>
          <button
            type="button"
            className={`mode-btn ${operationMode === "update" ? "active" : ""}`}
            onClick={() => setOperationMode("update")}
          >
            Update
          </button>
        </div>
        <div className="card-flip">
          <div className={`card-flip-inner ${operationMode === "update" ? "is-flipped" : ""}`}>
            <section className="glass-card card-face card-front">{renderCardFace("insert", insertFileInputRef)}</section>
            <section className="glass-card card-face card-back">{renderCardFace("update", updateFileInputRef)}</section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
