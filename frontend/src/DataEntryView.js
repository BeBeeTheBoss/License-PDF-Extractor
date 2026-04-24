import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

const ENTRY_TYPES = [
  "Steel",
  "Roofing/Ceiling/Wall",
  "Sanitary Ware",
  "Garden And Accessories",
  "Hardware And Tools",
  "Surface Covering",
  "Door, Windows And Wood",
  "Electrical And Accessories",
  "Home Appliance",
  "Paint And Chemical",
  "Houseware And Kitchen",
  "Furniture And Bedding",
  "Stationery & Digital Equipment",
  "CT",
  "DAP",
  "Other",
];
const FILE_STATUSES = ["Arrive Port", "Run", "Finished"];

const emptyRow = {
  entry_type: "",
  bl_no: "",
  product_name: "",
  sea_shipment_size: "",
  sea_shipment_qty: "",
  etd: "",
  eta_ygn: "",
  file_status: "",
  remark: "",
  issue_date: "",
  pi_no: "",
};

const normalizeRow = (row) => ({
  entry_type: row.entry_type,
  bl_no: row.bl_no.trim(),
  product_name: row.product_name.trim(),
  sea_shipment_size: row.sea_shipment_size || null,
  sea_shipment_qty: row.sea_shipment_qty ? Number(row.sea_shipment_qty) : null,
  etd: row.etd || null,
  eta_ygn: row.eta_ygn || null,
  file_status: row.file_status,
  remark: row.remark.trim() || null,
  issue_date: row.issue_date || null,
  pi_no: row.pi_no.trim(),
});

function DataEntryView({ apiBaseUrl, authToken, onUnauthorized, onBack }) {
  const [rows, setRows] = useState(() => [{ ...emptyRow }]);
  const [rowErrors, setRowErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ loading: false, message: "", error: "" });
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [editingEntries, setEditingEntries] = useState({});
  const [originalEntries, setOriginalEntries] = useState({});
  const [dirtyEntryIds, setDirtyEntryIds] = useState([]);
  const [savingEntryId, setSavingEntryId] = useState(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [productNames, setProductNames] = useState([]);
  const [remarkEditor, setRemarkEditor] = useState({
    open: false,
    value: "",
    target: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [productSuggest, setProductSuggest] = useState({ open: false, target: null, query: "" });
  const [productSuggestPos, setProductSuggestPos] = useState(null);
  const [filters, setFilters] = useState({
    query: "",
    type: "all",
    status: "all",
    etdFrom: "",
    etdTo: "",
    etaFrom: "",
    etaTo: "",
    issueFrom: "",
    issueTo: "",
  });
  const remarkTextareaRef = useRef(null);
  const productSuggestAnchorRef = useRef(null);
  const tableWrapRef = useRef(null);

  const headers = useMemo(
    () => ({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    }),
    [authToken]
  );

  const loadEntries = async () => {
    setEntriesLoading(true);
    setEntriesError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/data-entries`, { headers });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load entries.");
      }
      const list = payload?.data || [];
      setEntries(list);
      const normalized = list.reduce((acc, entry) => {
        acc[entry.id] = {
          entry_type: entry.entry_type || "",
          bl_no: entry.bl_no || "",
          product_name: entry.product_name || "",
          sea_shipment_size: entry.sea_shipment_size || "",
          sea_shipment_qty: entry.sea_shipment_qty || "",
          etd: entry.etd ? String(entry.etd).slice(0, 10) : "",
          eta_ygn: entry.eta_ygn ? String(entry.eta_ygn).slice(0, 10) : "",
          file_status: entry.file_status || "",
          remark: entry.remark || "",
          issue_date: entry.issue_date ? String(entry.issue_date).slice(0, 10) : "",
          pi_no: entry.pi_no || "",
        };
        return acc;
      }, {});
      setEditingEntries(normalized);
      setOriginalEntries(normalized);
    } catch (error) {
      setEntriesError(error.message || "Failed to load entries.");
    } finally {
      setEntriesLoading(false);
    }
  };

  const loadProductNames = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/data-entries/product-names`, { headers });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load product names.");
      }
      setProductNames(payload?.data || []);
    } catch (_error) {
      // Silently ignore for now; form still works without suggestions.
    }
  };

  useEffect(() => {
    loadEntries();
    loadProductNames();
  }, [apiBaseUrl, headers]);

  const updateRow = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) {
          return row;
        }
        const nextRow = { ...row, [field]: value };
        if (field === "etd" && nextRow.eta_ygn && nextRow.eta_ygn < value) {
          nextRow.eta_ygn = "";
        }
        return nextRow;
      })
    );
    setRowErrors((prev) => ({ ...prev, [index]: { ...(prev[index] || {}), [field]: "" } }));
    setSubmitStatus((prev) => ({ ...prev, error: "", message: "" }));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...emptyRow }]);
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setRowErrors({});
  };

  const resetRows = () => {
    setRows([{ ...emptyRow }]);
    setRowErrors({});
  };

  const isRowEmpty = (row) =>
    !row.entry_type &&
    !row.bl_no &&
    !row.product_name &&
    !row.sea_shipment_size &&
    !row.sea_shipment_qty &&
    !row.etd &&
    !row.eta_ygn &&
    !row.file_status &&
    !row.remark &&
    !row.issue_date &&
    !row.pi_no;

  const validateRows = (inputRows, { enforcePair = true } = {}) => {
    const errors = {};
    inputRows.forEach((row, index) => {
      if (isRowEmpty(row)) {
        return;
      }
      const rowErr = {};
      if (!row.entry_type) rowErr.entry_type = "Required";
      if (!row.bl_no) rowErr.bl_no = "Required";
      if (!row.product_name) rowErr.product_name = "Required";
      if (!row.etd) rowErr.etd = "Required";
      if (!row.file_status) rowErr.file_status = "Required";
      if (!row.pi_no) rowErr.pi_no = "Required";
      if (
        enforcePair &&
        ((row.sea_shipment_size && !row.sea_shipment_qty) || (!row.sea_shipment_size && row.sea_shipment_qty))
      ) {
        rowErr.sea_shipment_size = "Need size & qty";
        rowErr.sea_shipment_qty = "Need size & qty";
      }
      if (row.etd && row.eta_ygn && row.eta_ygn < row.etd) {
        rowErr.eta_ygn = "ETA cannot be before ETD";
      }
      if (Object.keys(rowErr).length > 0) {
        errors[index] = rowErr;
      }
    });
    return errors;
  };

  const validateUpdateEntry = (row, original) => {
    const errors = {};
    if (!row || isRowEmpty(row)) {
      return errors;
    }
    const requireIfMissing = (key) => {
      const originalHasValue = !!(original && original[key]);
      if (!row[key] && originalHasValue) {
        errors[key] = "Required";
      }
    };
    requireIfMissing("entry_type");
    requireIfMissing("bl_no");
    requireIfMissing("product_name");
    if (!row.etd) {
      errors.etd = "Required";
    }
    requireIfMissing("file_status");
    requireIfMissing("pi_no");
    if (row.etd && row.eta_ygn && row.eta_ygn < row.etd) {
      errors.eta_ygn = "ETA cannot be before ETD";
    }
    return errors;
  };

  const updateEditingEntry = (id, field, value) => {
    setEditingEntries((prev) => {
      const current = prev[id] || {};
      const nextEntry = { ...current, [field]: value };
      if (field === "etd" && nextEntry.eta_ygn && nextEntry.eta_ygn < value) {
        nextEntry.eta_ygn = "";
      }
      return {
        ...prev,
        [id]: nextEntry,
      };
    });
  };

  useEffect(() => {
    const dirtyIds = [];
    Object.keys(editingEntries).forEach((id) => {
      const current = editingEntries[id];
      const original = originalEntries[id];
      if (!current || !original) {
        return;
      }
      const isDirty = Object.keys(original).some((key) => String(current[key] ?? "") !== String(original[key] ?? ""));
      if (isDirty) {
        dirtyIds.push(Number(id));
      }
    });
    setDirtyEntryIds(dirtyIds);
  }, [editingEntries, originalEntries]);

  const openRemarkEditor = (target, currentValue) => {
    setRemarkEditor({
      open: true,
      value: currentValue || "",
      target,
    });
  };

  const closeRemarkEditor = () => {
    setRemarkEditor({ open: false, value: "", target: null });
  };

  const openProductSuggest = (target, query, anchorEl) => {
    productSuggestAnchorRef.current = anchorEl || null;
    setProductSuggest({ open: true, target, query: query || "" });
  };

  const closeProductSuggest = () => {
    productSuggestAnchorRef.current = null;
    setProductSuggest({ open: false, target: null, query: "" });
  };

  const updateProductSuggestPosition = () => {
    const anchor = productSuggestAnchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxHeight = 180;
    const gap = 4;
    const availableBelow = window.innerHeight - rect.bottom;
    const availableAbove = rect.top;
    const shouldFlip = availableBelow < maxHeight && availableAbove > availableBelow;
    let top = rect.bottom + window.scrollY + gap;
    if (shouldFlip) {
      top = rect.top + window.scrollY - maxHeight - gap;
      if (top < window.scrollY + 4) {
        top = window.scrollY + 4;
      }
    }
    setProductSuggestPos({
      top,
      left: rect.left + window.scrollX,
      width: rect.width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!productSuggest.open) {
      setProductSuggestPos(null);
      return;
    }
    updateProductSuggestPosition();
    const handleScroll = () => updateProductSuggestPosition();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    const tableNode = tableWrapRef.current;
    if (tableNode) {
      tableNode.addEventListener("scroll", handleScroll);
    }
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
      if (tableNode) {
        tableNode.removeEventListener("scroll", handleScroll);
      }
    };
  }, [productSuggest.open]);

  const productMatches = useMemo(() => {
    const query = productSuggest.query.trim().toLowerCase();
    const list = query
      ? productNames.filter((name) => String(name).toLowerCase().includes(query))
      : productNames;
    return list.slice(0, 8);
  }, [productNames, productSuggest.query]);

  const isProductSuggestOpenFor = (target) =>
    productSuggest.open &&
    productSuggest.target &&
    productSuggest.target.kind === target.kind &&
    productSuggest.target.key === target.key;

  const filteredEntries = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return entries.filter((entry) => {
      const row = editingEntries[entry.id] || entry;
      if (filters.type !== "all" && row.entry_type !== filters.type) {
        return false;
      }
      if (filters.status !== "all" && row.file_status !== filters.status) {
        return false;
      }
      const etdValue = row.etd ? String(row.etd).slice(0, 10) : "";
      if (filters.etdFrom && (!etdValue || etdValue < filters.etdFrom)) {
        return false;
      }
      if (filters.etdTo && (!etdValue || etdValue > filters.etdTo)) {
        return false;
      }
      const etaValue = row.eta_ygn ? String(row.eta_ygn).slice(0, 10) : "";
      if (filters.etaFrom && (!etaValue || etaValue < filters.etaFrom)) {
        return false;
      }
      if (filters.etaTo && (!etaValue || etaValue > filters.etaTo)) {
        return false;
      }
      const issueValue = row.issue_date ? String(row.issue_date).slice(0, 10) : "";
      if (filters.issueFrom && (!issueValue || issueValue < filters.issueFrom)) {
        return false;
      }
      if (filters.issueTo && (!issueValue || issueValue > filters.issueTo)) {
        return false;
      }
      if (query) {
        const haystack = [
          row.entry_type,
          row.bl_no,
          row.product_name,
          row.file_status,
          row.pi_no,
          row.remark,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, editingEntries, filters]);

  const saveRemarkEditor = () => {
    if (!remarkEditor.target) {
      closeRemarkEditor();
      return;
    }
    const { target, value } = remarkEditor;
    if (target.kind === "edit") {
      updateEditingEntry(target.id, "remark", value);
    } else if (target.kind === "new") {
      updateRow(target.index, "remark", value);
    }
    closeRemarkEditor();
  };

  const persistOrder = async (updatedEntries) => {
    if (updatedEntries.length === 0) {
      return;
    }
    setReorderSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/data-entries/reorder`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ordered_ids: updatedEntries.map((entry) => entry.id),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "Reorder failed.");
      }
    } catch (error) {
      setSubmitStatus({ loading: false, message: "", error: error.message || "Reorder failed." });
      loadEntries();
    } finally {
      setReorderSaving(false);
    }
  };

  const reorderByDrag = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }
    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const nextEntries = [...entries];
    const [moved] = nextEntries.splice(sourceIndex, 1);
    nextEntries.splice(targetIndex, 0, moved);
    setEntries(nextEntries);
    persistOrder(nextEntries);
  };

  const deleteEntry = async (id) => {
    setDeleteConfirm({ open: true, id });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ open: false, id: null });
  };

  const confirmDeleteEntry = async () => {
    if (!deleteConfirm.id) {
      return;
    }
    const id = deleteConfirm.id;
    setDeleteConfirm({ open: false, id: null });
    try {
      const response = await fetch(`${apiBaseUrl}/api/data-entries/${id}`, {
        method: "DELETE",
        headers,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "Delete failed.");
      }
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setEditingEntries((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setOriginalEntries((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      setSubmitStatus({ loading: false, message: "", error: error.message || "Delete failed." });
    }
  };

  useEffect(() => {
    if (!remarkEditor.open) {
      return;
    }
    const node = remarkTextareaRef.current;
    if (!node) {
      return;
    }
    const length = node.value.length;
    node.focus();
    node.setSelectionRange(length, length);
  }, [remarkEditor.open]);

  const saveEntry = async (id) => {
    const entry = editingEntries[id];
    if (!entry) {
      return;
    }
    const original = originalEntries[id];
    const validation = validateUpdateEntry(entry, original);
    if (Object.keys(validation).length > 0) {
      setSubmitStatus({ loading: false, message: "", error: "Please fill required fields before update." });
      return;
    }
    setSavingEntryId(id);
    setSubmitStatus({ loading: false, message: "", error: "" });
    try {
      const response = await fetch(`${apiBaseUrl}/api/data-entries/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(normalizeRow(entry)),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "Update failed.");
      }
      setSubmitStatus({ loading: false, message: payload?.message || "Updated.", error: "" });
      setLastSavedAt(new Date().toLocaleString());
      loadEntries();
      loadProductNames();
    } catch (error) {
      setSubmitStatus({ loading: false, message: "", error: error.message || "Update failed." });
    } finally {
      setSavingEntryId(null);
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    setSubmitStatus({ loading: true, message: "", error: "" });
    setRowErrors({});

    try {
      const validation = validateRows(rows, { enforcePair: false });
      if (Object.keys(validation).length > 0) {
        setRowErrors(validation);
        throw new Error("Please complete required fields.");
      }
      const rowMap = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !isRowEmpty(row));
      if (rowMap.length === 0) {
        throw new Error("Please add at least one row.");
      }

      const response = await fetch(`${apiBaseUrl}/api/data-entries/bulk`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          entries: rowMap.map(({ row }) => normalizeRow(row)),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        if (payload?.errors) {
          const nextErrors = {};
          Object.entries(payload.errors).forEach(([key, messages]) => {
            const match = key.match(/^entries\.(\d+)\.(.+)$/);
            if (!match) {
              return;
            }
            const filteredIndex = Number(match[1]);
            const rowIndex = rowMap[filteredIndex]?.index ?? filteredIndex;
            const field = match[2];
            if (!nextErrors[rowIndex]) {
              nextErrors[rowIndex] = {};
            }
            nextErrors[rowIndex][field] = Array.isArray(messages) ? messages[0] : messages;
          });
          setRowErrors(nextErrors);
        }
        throw new Error(payload?.message || "Save failed.");
      }
      const savedCount = Number(payload?.saved || rowMap.length || 0);
      setSubmitStatus({
        loading: false,
        message: payload?.message || `Saved ${savedCount} row${savedCount === 1 ? "" : "s"}.`,
        error: "",
      });
      setLastSavedAt(new Date().toLocaleString());
      loadProductNames();
      loadEntries();

      setRows([{ ...emptyRow }]);
    } catch (error) {
      setSubmitStatus({ loading: false, message: "", error: error.message || "Save failed." });
    } finally {
      setSubmitStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  const exportFilteredEntries = () => {
    if (filteredEntries.length === 0) {
      setSubmitStatus({ loading: false, message: "", error: "No rows to export." });
      return;
    }
    const headers = [
      "Type",
      "BL No",
      "Product",
      "Cont Type",
      "Qty",
      "ETD",
      "ETA YGN",
      "File Status",
      "Issue Date",
      "PI No",
      "Remark",
    ];
    const rows = filteredEntries.map((entry) => {
      const row = editingEntries[entry.id] || entry;
      return [
        row.entry_type || "",
        row.bl_no || "",
        row.product_name || "",
        row.sea_shipment_size || "",
        row.sea_shipment_qty || "",
        row.etd ? String(row.etd).slice(0, 10) : "",
        row.eta_ygn ? String(row.eta_ygn).slice(0, 10) : "",
        row.file_status || "",
        row.issue_date ? String(row.issue_date).slice(0, 10) : "",
        row.pi_no || "",
        row.remark || "",
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Shipment Table");
    const filename = `shipment-table-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename, { compression: true });
  };

  return (
    <div className="card-stack data-entry-stack">
      <div className="data-entry-head">
        <div>
          <span className="eyebrow">Data Entry</span>
          <h1>Shipment Table</h1>
          <p className="subtitle">Excel/Google Form style input for shipment type data.</p>
        </div>
        <div className="data-entry-actions">
          <button type="button" className="upload-btn secondary-btn" onClick={onBack}>
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
                <path d="M9 12h10" />
              </svg>
            </span>
            Back to Extractor
          </button>
        </div>
      </div>

      <section className="glass-card data-entry-card">
        <div className="table-head">
          <h2>Saved Entries (Database)</h2>
        </div>
        <div className="table-filters">
          <div className="filter-row">
            <label className="filter-field">
              <span>Type</span>
              <select
                value={filters.type}
                onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="all">All</option>
                {ENTRY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="all">All</option>
                {FILE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>ETD From</span>
              <input
                type="date"
                value={filters.etdFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, etdFrom: e.target.value }))}
              />
            </label>
            <label className="filter-field">
              <span>ETD To</span>
              <input
                type="date"
                value={filters.etdTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, etdTo: e.target.value }))}
              />
            </label>
            <label className="filter-field">
              <span>ETA From</span>
              <input
                type="date"
                value={filters.etaFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, etaFrom: e.target.value }))}
              />
            </label>
            <label className="filter-field">
              <span>ETA To</span>
              <input
                type="date"
                value={filters.etaTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, etaTo: e.target.value }))}
              />
            </label>
            <label className="filter-field">
              <span>Issue From</span>
              <input
                type="date"
                value={filters.issueFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, issueFrom: e.target.value }))}
              />
            </label>
            <label className="filter-field">
              <span>Issue To</span>
              <input
                type="date"
                value={filters.issueTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, issueTo: e.target.value }))}
              />
            </label>
            <label className="filter-field filter-search">
              <span>Search</span>
              <input
                type="search"
                placeholder="BL No, product, PI, remark..."
                value={filters.query}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              />
            </label>
          </div>
        </div>
        {entriesError && <p className="input-error">{entriesError}</p>}
        <div className="inline-table-wrap" ref={tableWrapRef}>
          <table className="inline-entry-table">
            <thead>
              <tr>
                <th aria-label="Sort" />
                <th>
                  Type <span className="required-mark">*</span>
                </th>
                <th>
                  BL No <span className="required-mark">*</span>
                </th>
                <th className="col-product">
                  Product <span className="required-mark">*</span>
                </th>
                <th className="col-sea-size">Cont Type</th>
                <th className="col-qty">Qty</th>
                <th>
                  ETD <span className="required-mark">*</span>
                </th>
                <th>ETA YGN</th>
                <th className="col-status">
                  File Status <span className="required-mark">*</span>
                </th>
                <th>Issue Date</th>
                <th>
                  PI No <span className="required-mark">*</span>
                </th>
                <th>Remark</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 && !entriesLoading ? (
                <tr>
                  <td colSpan="13" className="empty-cell">
                    No saved entries.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const row = editingEntries[entry.id] || {};
                  return (
                    <tr
                      key={entry.id}
                      className={[
                        dirtyEntryIds.includes(entry.id) ? "row-dirty" : "",
                        draggingId === entry.id ? "row-dragging" : "",
                        dragOverId === entry.id ? "row-drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverId !== entry.id) {
                          setDragOverId(entry.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderByDrag(draggingId, entry.id);
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                    >
                      <td className="col-drag">
                        <span
                          className="drag-handle"
                          role="button"
                          tabIndex={0}
                          aria-label="Drag to reorder"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            const rowNode = event.currentTarget.closest("tr");
                            if (rowNode) {
                              const rect = rowNode.getBoundingClientRect();
                              const offsetX = event.clientX - rect.left;
                              const offsetY = event.clientY - rect.top;
                              event.dataTransfer.setDragImage(rowNode, offsetX, offsetY);
                            }
                            setDraggingId(entry.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverId(null);
                          }}
                        >
                          <img src="/dots-six-vertical-bold.svg" alt="" aria-hidden="true" />
                        </span>
                      </td>
                      <td>
                        <select
                          value={row.entry_type || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "entry_type", e.target.value)}
                        >
                          <option value="">Choose</option>
                          {ENTRY_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.bl_no || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "bl_no", e.target.value)}
                        />
                      </td>
                      <td className="col-product">
                        <div className="product-input-wrap">
                          <input
                            type="text"
                            value={row.product_name || ""}
                            onChange={(e) => {
                              updateEditingEntry(entry.id, "product_name", e.target.value);
                              openProductSuggest({ kind: "edit", key: entry.id }, e.target.value, e.currentTarget);
                            }}
                            onFocus={(e) =>
                              openProductSuggest({ kind: "edit", key: entry.id }, e.target.value, e.currentTarget)
                            }
                            onBlur={() => setTimeout(closeProductSuggest, 120)}
                          />
                        </div>
                      </td>
                      <td className="col-sea-size">
                        <select
                          value={row.sea_shipment_size || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "sea_shipment_size", e.target.value)}
                        >
                          <option value="">-</option>
                          <option value="20">20&apos;</option>
                          <option value="40">40&apos;</option>
                        </select>
                      </td>
                      <td className="col-qty">
                        <input
                          type="number"
                          min="1"
                          className="qty-input"
                          value={row.sea_shipment_qty || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "sea_shipment_qty", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.etd || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "etd", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.eta_ygn || ""}
                          min={row.etd || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "eta_ygn", e.target.value)}
                        />
                      </td>
                      <td className="col-status">
                        <select
                          value={row.file_status || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "file_status", e.target.value)}
                        >
                          <option value="">Choose</option>
                          {FILE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.issue_date || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "issue_date", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.pi_no || ""}
                          onChange={(e) => updateEditingEntry(entry.id, "pi_no", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="remark-input"
                          value={row.remark || ""}
                          onClick={() => openRemarkEditor({ kind: "edit", id: entry.id }, row.remark || "")}
                          onFocus={() => openRemarkEditor({ kind: "edit", id: entry.id }, row.remark || "")}
                          readOnly
                        />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className={`icon-btn ${dirtyEntryIds.includes(entry.id) ? "dirty-save" : ""}`.trim()}
                            onClick={() => saveEntry(entry.id)}
                            disabled={savingEntryId === entry.id}
                            aria-label={savingEntryId === entry.id ? "Saving entry" : "Save entry"}
                            title={savingEntryId === entry.id ? "Saving..." : "Save"}
                          >
                            <span className="btn-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <path d="M17 21v-8H7v8" />
                                <path d="M7 3v5h8" />
                              </svg>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-danger"
                            onClick={() => deleteEntry(entry.id)}
                            aria-label="Delete entry"
                            title="Delete"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M6 6l1 14h10l1-14" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {rows.map((row, index) => {
                const error = rowErrors[index] || {};
                return (
                  <tr key={`new-${index}`} className="new-row">
                    <td className="col-drag" />
                    <td>
                      <select value={row.entry_type} onChange={(e) => updateRow(index, "entry_type", e.target.value)}>
                        <option value="">Choose</option>
                        {ENTRY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      {error.entry_type && <span className="cell-error">{error.entry_type}</span>}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.bl_no}
                        onChange={(e) => updateRow(index, "bl_no", e.target.value)}
                      />
                      {error.bl_no && <span className="cell-error">{error.bl_no}</span>}
                    </td>
                    <td className="col-product">
                      <div className="product-input-wrap">
                        <input
                          type="text"
                          value={row.product_name}
                          onChange={(e) => {
                            updateRow(index, "product_name", e.target.value);
                            openProductSuggest({ kind: "new", key: index }, e.target.value, e.currentTarget);
                          }}
                          onFocus={(e) =>
                            openProductSuggest({ kind: "new", key: index }, e.target.value, e.currentTarget)
                          }
                          onBlur={() => setTimeout(closeProductSuggest, 120)}
                        />
                      </div>
                      {error.product_name && <span className="cell-error">{error.product_name}</span>}
                    </td>
                    <td className="col-sea-size">
                      <select
                        value={row.sea_shipment_size}
                        onChange={(e) => updateRow(index, "sea_shipment_size", e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="20">20&apos;</option>
                        <option value="40">40&apos;</option>
                      </select>
                      {error.sea_shipment_size && <span className="cell-error">{error.sea_shipment_size}</span>}
                    </td>
                    <td className="col-qty">
                      <input
                        type="number"
                        min="1"
                        className="qty-input"
                        value={row.sea_shipment_qty}
                        onChange={(e) => updateRow(index, "sea_shipment_qty", e.target.value)}
                      />
                      {error.sea_shipment_qty && <span className="cell-error">{error.sea_shipment_qty}</span>}
                    </td>
                    <td>
                      <input type="date" value={row.etd} onChange={(e) => updateRow(index, "etd", e.target.value)} />
                      {error.etd && <span className="cell-error">{error.etd}</span>}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={row.eta_ygn}
                        min={row.etd || ""}
                        onChange={(e) => updateRow(index, "eta_ygn", e.target.value)}
                      />
                      {error.eta_ygn && <span className="cell-error">{error.eta_ygn}</span>}
                    </td>
                    <td className="col-status">
                      <select
                        value={row.file_status}
                        onChange={(e) => updateRow(index, "file_status", e.target.value)}
                      >
                        <option value="">Choose</option>
                        {FILE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      {error.file_status && <span className="cell-error">{error.file_status}</span>}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={row.issue_date}
                        onChange={(e) => updateRow(index, "issue_date", e.target.value)}
                      />
                    </td>
                    <td>
                      <input type="text" value={row.pi_no} onChange={(e) => updateRow(index, "pi_no", e.target.value)} />
                      {error.pi_no && <span className="cell-error">{error.pi_no}</span>}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="remark-input"
                        value={row.remark}
                        onClick={() => openRemarkEditor({ kind: "new", index }, row.remark)}
                        onFocus={() => openRemarkEditor({ kind: "new", index }, row.remark)}
                        readOnly
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeRow(index)}
                        disabled={rows.length === 1}
                      >
                        <span className="btn-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M5 12h14" />
                          </svg>
                        </span>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-actions">
          {dirtyEntryIds.length > 0 && (
            <div className="save-reminder" role="status" aria-live="polite">
              You have {dirtyEntryIds.length} unsaved change{dirtyEntryIds.length === 1 ? "" : "s"}. Please save.
            </div>
          )}
          <button type="button" className="upload-btn" onClick={handleSubmit} disabled={submitStatus.loading}>
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8" />
                <path d="M7 3v5h8" />
              </svg>
            </span>
            {submitStatus.loading ? "Saving..." : "Save Entries"}
          </button>
          <button type="button" className="upload-btn secondary-btn" onClick={addRow} disabled={submitStatus.loading}>
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            Add Row
          </button>
          <button type="button" className="upload-btn secondary-btn" onClick={resetRows} disabled={submitStatus.loading}>
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </span>
            Clear New Rows
          </button>
          <button
            type="button"
            className="upload-btn secondary-btn"
            onClick={loadEntries}
            disabled={entriesLoading}
          >
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
            </span>
            {entriesLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="upload-btn export-btn" onClick={exportFilteredEntries}>
            <span className="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3v12" />
                <path d="M8 11l4 4 4-4" />
                <path d="M5 21h14" />
              </svg>
            </span>
            Export Excel
          </button>
        </div>

        {submitStatus.error && <p className="input-error">{submitStatus.error}</p>}
        {submitStatus.message && !submitStatus.error && (
          <div className="save-banner mt-5" role="status" aria-live="polite">
            <span className="save-title">{submitStatus.message}</span>
            {lastSavedAt && <span className="save-meta">Last saved: {lastSavedAt}</span>}
          </div>
        )}
      </section>

      <div className="data-entry-footnote">
        <p className="status-hint">All data will be saved directly from this table.</p>
      </div>

      {remarkEditor.open && (
        <div className="remark-modal" role="dialog" aria-modal="true">
          <div className="remark-modal-backdrop" onClick={closeRemarkEditor} />
          <div className="remark-modal-card">
            <h3>Remark</h3>
            <textarea
              ref={remarkTextareaRef}
              value={remarkEditor.value}
              onChange={(e) => setRemarkEditor((prev) => ({ ...prev, value: e.target.value }))}
              rows={6}
              autoFocus
            />
            <div className="remark-modal-actions">
              <button type="button" className="upload-btn secondary-btn" onClick={closeRemarkEditor}>
                <span className="btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </span>
                Cancel
              </button>
              <button type="button" className="upload-btn" onClick={saveRemarkEditor}>
                <span className="btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                Save Remark
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.open && (
        <div className="remark-modal" role="dialog" aria-modal="true">
          <div className="remark-modal-backdrop" onClick={closeDeleteConfirm} />
          <div className="remark-modal-card">
            <h3>Delete entry?</h3>
            <p>This action cannot be undone.</p>
            <div className="remark-modal-actions">
              <button type="button" className="upload-btn secondary-btn" onClick={closeDeleteConfirm}>
                <span className="btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </span>
                Cancel
              </button>
              <button type="button" className="upload-btn danger-btn" onClick={confirmDeleteEntry}>
                <span className="btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                  </svg>
                </span>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {productSuggest.open &&
        isProductSuggestOpenFor(productSuggest.target || {}) &&
        productMatches.length > 0 &&
        productSuggestPos &&
        createPortal(
          <div
            className="product-suggest"
            style={{
              position: "absolute",
              top: `${productSuggestPos.top}px`,
              left: `${productSuggestPos.left}px`,
              width: `${productSuggestPos.width}px`,
              maxHeight: `${productSuggestPos.maxHeight}px`,
            }}
          >
            {productMatches.map((name) => (
              <button
                type="button"
                key={name}
                className="product-option"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (productSuggest.target?.kind === "edit") {
                    updateEditingEntry(productSuggest.target.key, "product_name", name);
                  } else if (productSuggest.target?.kind === "new") {
                    updateRow(productSuggest.target.key, "product_name", name);
                  }
                  closeProductSuggest();
                }}
              >
                {name}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export default DataEntryView;
