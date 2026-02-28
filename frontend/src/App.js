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

const AUTH_TOKEN_KEY = "pdf_extractor_admin_token";

const withTokenInUrl = (url, token) => {
  if (!url || !token) {
    return toBackendUrl(url || "");
  }
  const absolute = toBackendUrl(url);
  const target = new URL(absolute);
  target.searchParams.set("token", token);
  return target.toString();
};

function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("admin@gmail.com");
  const [loginPassword, setLoginPassword] = useState("123456");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
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
    const verifyAuth = async () => {
      if (!authToken) {
        setIsAuthenticated(false);
        setAuthChecking(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("Unauthorized");
        }
        const payload = await response.json();
        setAuthEmail(payload?.email || "");
        setIsAuthenticated(true);
      } catch (_err) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken("");
        setIsAuthenticated(false);
        setAuthEmail("");
      } finally {
        setAuthChecking(false);
      }
    };

    verifyAuth();
  }, [authToken]);

  const resetUiState = () => {
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
  };

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
    resetUiState();
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
          Authorization: `Bearer ${authToken}`,
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
      setDownloadUrl(withTokenInUrl(downloadInfo.download_url || "", authToken));
      setProgress(100);
      setStatus("success");
    } catch (error) {
      if ((error.message || "").toLowerCase().includes("unauthorized")) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken("");
        setIsAuthenticated(false);
        setAuthEmail("");
      }
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

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.token) {
        throw new Error(payload?.message || "Login failed.");
      }

      localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
      setAuthToken(payload.token);
      setAuthEmail(payload.email || loginEmail.trim());
      setIsAuthenticated(true);
      setLoginPassword("");
    } catch (error) {
      setLoginError(error.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        });
      }
    } catch (_err) {
      // Ignore network logout failures and clear local auth anyway.
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthToken("");
      setIsAuthenticated(false);
      setAuthEmail("");
      resetUiState();
    }
  };

  if (authChecking) {
    return (
      <main className="app-shell">
        <div className="card-stack auth-center">
          <section className="glass-card auth-card">
            <p className="status-hint">Checking authentication...</p>
          </section>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell">
        <div className="bg-blob blob-a" aria-hidden="true" />
        <div className="bg-blob blob-b" aria-hidden="true" />
        <div className="card-stack auth-center">
          <div className="signin-bee" aria-hidden="true">
            <Lottie className="signin-bee-lottie" animationData={beeLoungingAnimation} loop />
          </div>
          <section className="glass-card auth-card">
            <span className="eyebrow">Admin Login</span>
            <h1>Sign In</h1>
            <p className="subtitle">Only admin account can access the extraction page.</p>
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                className="auth-input"
                type="email"
                placeholder="Email"
                // value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Password"
                // value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              {loginError && <p className="input-error">{loginError}</p>}
              <button className="upload-btn auth-btn" type="submit" disabled={loginLoading}>
                {loginLoading ? "Signing in..." : "Login"}
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="bg-blob blob-a" aria-hidden="true" />
      <div className="bg-blob blob-b" aria-hidden="true" />

      <div className="card-stack">
        <div className="auth-meta">
          <span className="auth-user">{authEmail}</span>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="mode-toggle" role="group" aria-label="Operation mode">
          <button
            type="button"
            className={`mode-btn ${operationMode === "insert" ? "active" : ""}`}
            onClick={() => {
              if (operationMode === "insert") return;
              resetUiState();
              setOperationMode("insert");
            }}
          >
            Insert
          </button>
          <button
            type="button"
            className={`mode-btn ${operationMode === "update" ? "active" : ""}`}
            onClick={() => {
              if (operationMode === "update") return;
              resetUiState();
              setOperationMode("update");
            }}
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
