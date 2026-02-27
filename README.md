# PDF Extractor Project (React + Laravel + Python)

## Structure

- `backend/`: Laravel backend + Python extractor script
- `frontend/`: React upload client

## Backend Setup (Laravel + Python)

1. Install Laravel into `backend`:

```bash
cd /home/bebee/Desktop/Dev/PDF-Extractor
composer create-project laravel/laravel backend
```

2. Keep these files from this template:
- `backend/app/Http/Controllers/PdfController.php`
- `backend/routes/api.php`
- `backend/pdf_extractor.py`

3. Install Python libs:

```bash
sudo apt install python3-pip -y
pip3 install pdfplumber
```

4. Run Laravel API:

```bash
cd backend
php artisan serve
```

API URL: `http://localhost:8000/api/upload`

For access from another device on your LAN, run:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

Then set frontend API URL (in `frontend/.env`):

```env
REACT_APP_API_URL=http://YOUR_UBUNTU_IP:8000
```

5. Optional: store extracted text in Google Sheets:
- Create a Google Cloud project and enable the **Google Sheets API**.
- Create a **Service Account** and generate a JSON key.
- Share your target Google Sheet with the service account email (Editor access).
- Set these values in `backend/.env`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_SHEET_NAME=Sheet1
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- Keep `\n` in the private key exactly as shown.

## Frontend Setup (React)

1. Install frontend deps:

```bash
cd frontend
npm install
```

2. Start React app:

```bash
npm start
```

Frontend URL: `http://localhost:3000`

## Flow

1. Upload PDF from React.
2. Laravel stores file in `storage/app/pdfs`.
3. Laravel executes `pdf_extractor.py`.
4. Python extracts text into `storage/app/private/pdfs/extracted`.
5. Backend appends extracted text to Google Sheets (if configured).

## Optional Enhancements

- Multiple PDF upload support
- Image gallery in React
- Progress UI for large files
- Laravel queue worker for async processing
