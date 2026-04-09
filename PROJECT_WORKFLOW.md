# Project Workflow Breakdown

This document summarizes how the PDF‑Extractor project works end‑to‑end and where each major piece of logic lives. It is intended as a quick context refresh for future sessions.

## High‑Level Flow

1. User logs in (frontend) and chooses:
   - Document Type: `OIL` or `YGN`
   - Operation Mode: `insert` or `update`
   - Optional: Spreadsheet ID override
2. User uploads a PDF.
3. Backend runs OCR extraction (`pdf_extractor.py`) and reads `extracted_text.txt`.
4. Backend parses the extracted text, builds table rows + metadata.
5. Backend writes results to Google Sheets, with tabs separated by **month** derived from Document Date.
6. Optional Fix action can backfill missing columns/data and re‑split sheets by month.

## Frontend Responsibilities (React)

File: `frontend/src/App.js`

- Handles authentication token storage and login.
- Provides UI for `insert` and `update` modes.
- Uploads PDF to backend endpoint `/api/upload`.
- Provides **Fix Document Dates** action (button) to call `/api/fix-document-dates`.
- Displays responses and debug info (when enabled).

File: `frontend/src/App.css`

- Styling for upload UI, fix panel, debug box, etc.

## Backend Responsibilities (Laravel)

File: `backend/app/Http/Controllers/PdfController.php`

### 1) Upload Endpoint

- Route: `POST /api/upload`
- Validates:
  - PDF file
  - `document_type` in `OIL | YGN`
  - `operation_mode` in `insert | update`
- Runs OCR extraction script (`pdf_extractor.py`).
- Reads `extracted_text.txt`.
- Sends to Google Sheets via `appendExtractedTextToGoogleSheet()`.

### 2) Parsing Logic

Key methods:

- `extractOilRows($text)`
  - Parses table rows from extracted OCR text.
  - Supports single‑line rows and split tail formats.
  - Accepts flexible `Unit Code` (not limited to A‑Z).

- `extractDocumentMetadata($text)`
  - Extracts:
    - `document_no`
    - `licence` + `(document date)` if present
    - importer / consignor / transport / CIF values
    - `start_valid_date` / `last_valid_date` if present
  - If `document_date` is not present, it can be derived later from:
    - `start_valid_date`, or
    - `last_date_of_import` minus 3 months plus 1 day

### 3) Sheet Routing (Month‑Based Tabs)

- Tabs are separated **by month** (format: `YYYY-MM`).
- The month is derived from:
  1. `document_date` (preferred)
  2. `start_valid_date` (if present)
  3. `last_date_of_import` minus 3 months + 1 day

Key methods:

- `resolveDocumentDateSheetName()`
  - Converts the document date to a month key and sanitizes for tab title.

- `dateToMonthKey()`
  - Converts `DD/MM/YYYY` or `YYYY/MM/DD` to `YYYY-MM`.

### 4) Insert Mode

- Builds:
  - Exchange rate block
  - Header row
  - Data rows
  - Total row
- Writes into the **month tab**.
- If no tab exists:
  - Creates a new tab
  - If spreadsheet only has one empty tab, it renames that tab instead of creating a new one.

### 5) Update Mode

- Updates rows by matching:
  - `Licence` + `HSCode` + `Description` (normalized)
- Adds `Used Quantity` and `Balance Quantity` headers into **every table block**.
- Updates all matching rows across table blocks within the tab.

### 6) Fix Document Dates

- Endpoint: `POST /api/fix-document-dates`
- Actions:
  - Ensures `Document Date` column exists after `Document No` in every table.
  - Backfills missing document dates using:
    - `last_date_of_import` minus 3 months + 1 day
  - Splits sheet into **month tabs**.
  - Each month tab contains multiple table blocks, each block includes:
    - Exchange rate block
    - Header row
    - Data rows
    - Total row

## Google Sheets Integration

- Sheets API v4 with service account.
- Spreadsheet IDs are separated by document type:
  - `GOOGLE_SHEETS_SPREADSHEET_ID_OIL`
  - `GOOGLE_SHEETS_SPREADSHEET_ID_YGN`

- Batch operations used to reduce quota usage:
  - `values:batchClear`
  - `values:batchUpdate`

## OCR / Extraction

- Python script: `pdf_extractor.py`
- Output file:
  - `backend/storage/app/private/pdfs/extracted/extracted_text.txt`

## Common Pitfalls

- `node_modules/.cache` should not be tracked by git.
- Sheet tab names cannot include `/`, so dates are sanitized to `YYYY-MM`.
- If month tab is missing in update mode, update will error until a tab exists.

## Quick Reference: Key Methods

- `appendExtractedTextToGoogleSheet()`
- `extractOilRows()`
- `extractDocumentMetadata()`
- `resolveDocumentDateSheetName()`
- `splitSheetByDocumentDate()`
- `applyOilUsageUpdateToGoogleSheet()`
- `fixDocumentDates()`

