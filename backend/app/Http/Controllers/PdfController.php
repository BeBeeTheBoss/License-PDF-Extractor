<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PdfController extends Controller
{
    public function upload(Request $request)
    {
        $request->validate([
            'pdf' => 'required|mimes:pdf|max:10240',
            'document_type' => 'required|in:OIL,YGN',
            'spreadsheet_id' => 'nullable|string|regex:/^[a-zA-Z0-9-_]+$/',
        ]);
        $file = $request->file('pdf');
        $documentType = (string) $request->input('document_type');

        $path = $file->storeAs('pdfs', $file->getClientOriginalName());

        // Call Python script
        $pythonPath = base_path('pdf_extractor.py');
        $pdfPath = Storage::path($path);

        $command = sprintf(
            'python3 %s %s 2>&1',
            escapeshellarg($pythonPath),
            escapeshellarg($pdfPath)
        );

        $output = shell_exec($command);

        $textPath = dirname($pdfPath).DIRECTORY_SEPARATOR.'extracted'.DIRECTORY_SEPARATOR.'extracted_text.txt';
        $extractedText = is_file($textPath) ? (string) file_get_contents($textPath) : '';
        $sheetsResult = $this->appendExtractedTextToGoogleSheet(
            $documentType,
            $file->getClientOriginalName(),
            $path,
            $extractedText,
            $request->input('spreadsheet_id')
        );
        // CSV export disabled for better request performance.
        // Re-enable by calling generateGoogleSheetsCsvExport(...) again if needed.
        $exportResult = [
            'status' => 'disabled',
            'message' => 'Downloadable CSV export is disabled.',
            'download_url' => null,
        ];

        return response()->json([
            'message' => 'PDF processed',
            'output' => $output,
            'google_sheets' => $sheetsResult,
            'downloadable_sheet' => $exportResult,
        ]);
    }

    public function downloadExport(string $filename)
    {
        $safeFilename = basename($filename);
        $path = 'exports/'.$safeFilename;

        if (! Storage::exists($path)) {
            abort(404, 'Export file not found.');
        }

        return Storage::download($path, $safeFilename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    private function appendExtractedTextToGoogleSheet(
        string $documentType,
        string $fileName,
        string $storedPath,
        string $text,
        ?string $overrideSpreadsheetId = null
    ): array
    {
        $typeSpecificSpreadsheetId = $documentType === 'OIL'
            ? trim((string) env('GOOGLE_SHEETS_SPREADSHEET_ID_OIL', ''))
            : trim((string) env('GOOGLE_SHEETS_SPREADSHEET_ID_YGN', ''));
        $spreadsheetId = trim((string) ($overrideSpreadsheetId
            ?: ($typeSpecificSpreadsheetId !== '' ? $typeSpecificSpreadsheetId : config('services.google_sheets.spreadsheet_id'))));
        $sheetName = (string) config('services.google_sheets.sheet_name', 'Sheet1');
        $serviceAccountEmail = (string) config('services.google_sheets.service_account_email');
        $serviceAccountPrivateKey = (string) config('services.google_sheets.service_account_private_key');
        $autoCreate = filter_var(env('GOOGLE_SHEETS_AUTO_CREATE', false), FILTER_VALIDATE_BOOL);
        $shareEmail = trim((string) env('GOOGLE_SHEETS_SHARE_EMAIL', ''));
        $spreadsheetUrl = $spreadsheetId !== ''
            ? "https://docs.google.com/spreadsheets/d/{$spreadsheetId}/edit#gid=0"
            : null;

        if ($serviceAccountEmail === '' || $serviceAccountPrivateKey === '') {
            return [
                'status' => 'skipped',
                'message' => 'Google Sheets is not configured.',
                'spreadsheet_url' => $spreadsheetUrl,
            ];
        }

        try {
            $accessToken = $this->fetchGoogleAccessToken($serviceAccountEmail, $serviceAccountPrivateKey);

            if ($autoCreate || $spreadsheetId === '') {
                $created = $this->createSpreadsheet(
                    $accessToken,
                    $sheetName,
                    "{$documentType} Extract - {$fileName} - ".now()->format('Y-m-d H:i:s')
                );
                $spreadsheetId = $created['spreadsheet_id'];
                $spreadsheetUrl = $created['spreadsheet_url'];
                $sheetName = $created['sheet_name'];

                if ($shareEmail !== '') {
                    $this->shareSpreadsheetWithEmail($accessToken, $spreadsheetId, $shareEmail);
                }
            }

            if (in_array($documentType, ['OIL', 'YGN'], true)) {
                $oilRows = $this->extractOilRows($text);
                if ($oilRows === []) {
                    return [
                        'status' => 'error',
                        'message' => "No {$documentType} table rows found in extracted text.",
                        'spreadsheet_url' => $spreadsheetUrl,
                    ];
                }

                $metadata = $this->extractDocumentMetadata($text);
                $exchangeInfo = $this->fetchExchangeRatesToUsdRows();
                $sheetRange = rawurlencode($sheetName.'!A:R');
                $values = [];
                if ($exchangeInfo['rows'] !== []) {
                    $values[] = [
                        '',
                        "Exchange Rate Information (as of {$exchangeInfo['as_of']})",
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                    ];
                    $values[] = ['No', 'Currency', 'Rate to USD', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
                    foreach ($exchangeInfo['rows'] as $idx => $rateRow) {
                        $values[] = [(string) ($idx + 1), $rateRow[0], $rateRow[1], '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
                    }
                    $values[] = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
                }
                $values[] = [
                    'No',
                    'Document No',
                    'Importer (Name & Address)',
                    'Registration No/Valid Date',
                    'Consignor (Name & Address)',
                    'Last Date of Import',
                    'Mode of transport',
                    'Place/Port of discharge',
                    'Licence',
                    'Country Whence Consigned',
                    'Country of Origin',
                    'Method of Import',
                    'Total CIF Value (Kyats)',
                    'Hscode',
                    'Description of Goods',
                    'Unit Code',
                    'Unit Price',
                    'Quantity',
                    'Value(USD)',
                ];
                foreach ($oilRows as $row) {
                    $values[] = [
                        $row['no'],
                        $this->stripMyanmarText($metadata['document_no']),
                        $this->stripMyanmarText($metadata['importer']),
                        $this->stripMyanmarText($metadata['registration_valid_date']),
                        $this->stripMyanmarText($metadata['consignor']),
                        $this->stripMyanmarText($metadata['last_date_of_import']),
                        $this->stripMyanmarText($metadata['mode_of_transport']),
                        $this->stripMyanmarText($metadata['place_port_of_discharge']),
                        $this->stripMyanmarText($metadata['licence']),
                        $this->stripMyanmarText($metadata['country_whence_consigned']),
                        $this->stripMyanmarText($metadata['country_of_origin']),
                        $this->stripMyanmarText($metadata['method_of_import']),
                        $this->stripMyanmarText($metadata['total_cif_kyats']),
                        $row['hscode'],
                        $this->stripMyanmarText($row['description']),
                        $row['unit_code'],
                        $this->asSheetTextDecimal4($row['unit_price']),
                        $this->asSheetTextDecimal4($row['quantity']),
                        $this->asSheetTextDecimal4($row['value_usd']),
                    ];
                }
                $values[] = [
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    'Total Value',
                    '',
                    '',
                    $this->asSheetTextDecimal4($this->extractOilTotalQuantity($text, $oilRows)),
                    $this->asSheetTextDecimal4($this->extractOilTotalValueUsd($text, $oilRows)),
                ];

                $response = Http::withToken($accessToken)->post(
                    "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$sheetRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
                    [
                        'majorDimension' => 'ROWS',
                        'values' => $values,
                    ]
                );
            } else {
                $sheetRange = rawurlencode($sheetName.'!A:E');
                $textForSheet = mb_substr(trim($text), 0, 49000);

                $response = Http::withToken($accessToken)->post(
                    "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$sheetRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
                    [
                        'majorDimension' => 'ROWS',
                        'values' => [[
                            now()->toIso8601String(),
                            $documentType,
                            $fileName,
                            $storedPath,
                            $textForSheet,
                        ]],
                    ]
                );
            }

            if (! $response->successful()) {
                throw new \RuntimeException('Google Sheets append failed: '.$response->body());
            }

            return [
                'status' => 'success',
                'message' => in_array($documentType, ['OIL', 'YGN'], true)
                    ? "{$documentType} table saved to Google Sheets."
                    : 'Extracted text saved to Google Sheets.',
                'spreadsheet_url' => $spreadsheetUrl,
            ];
        } catch (\Throwable $e) {
            Log::warning('Google Sheets write failed', ['error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'message' => $e->getMessage(),
                'spreadsheet_url' => $spreadsheetUrl,
            ];
        }
    }

    private function createSpreadsheet(string $accessToken, string $sheetName, string $title): array
    {
        $response = Http::withToken($accessToken)->post('https://sheets.googleapis.com/v4/spreadsheets', [
            'properties' => [
                'title' => $title,
            ],
            'sheets' => [[
                'properties' => [
                    'title' => $sheetName,
                ],
            ]],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Google Sheets create failed: '.$response->body());
        }

        $spreadsheetId = (string) $response->json('spreadsheetId');
        $spreadsheetUrl = (string) $response->json('spreadsheetUrl');
        $createdSheetName = (string) ($response->json('sheets.0.properties.title') ?? $sheetName);

        if ($spreadsheetId === '') {
            throw new \RuntimeException('Google Sheets create response missing spreadsheetId.');
        }

        return [
            'spreadsheet_id' => $spreadsheetId,
            'spreadsheet_url' => $spreadsheetUrl !== '' ? $spreadsheetUrl : "https://docs.google.com/spreadsheets/d/{$spreadsheetId}/edit#gid=0",
            'sheet_name' => $createdSheetName,
        ];
    }

    private function fetchGoogleAccessToken(string $serviceAccountEmail, string $serviceAccountPrivateKey): string
    {
        $now = time();
        $privateKey = str_replace("\\n", "\n", $serviceAccountPrivateKey);
        $jwt = $this->buildSignedJwt(
            [
                'iss' => $serviceAccountEmail,
                'scope' => 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
                'aud' => 'https://oauth2.googleapis.com/token',
                'iat' => $now,
                'exp' => $now + 3600,
            ],
            $privateKey
        );

        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('OAuth token request failed: '.$response->body());
        }

        $accessToken = (string) $response->json('access_token');
        if ($accessToken === '') {
            throw new \RuntimeException('OAuth token response did not contain access_token.');
        }

        return $accessToken;
    }

    private function shareSpreadsheetWithEmail(string $accessToken, string $spreadsheetId, string $email): void
    {
        $response = Http::withToken($accessToken)->post(
            "https://www.googleapis.com/drive/v3/files/{$spreadsheetId}/permissions",
            [
                'role' => 'writer',
                'type' => 'user',
                'emailAddress' => $email,
            ]
        );

        if (! $response->successful()) {
            throw new \RuntimeException('Google Drive share failed: '.$response->body());
        }
    }

    private function buildSignedJwt(array $claims, string $privateKey): string
    {
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $encodedHeader = $this->base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $encodedClaims = $this->base64UrlEncode(json_encode($claims, JSON_UNESCAPED_SLASHES));
        $unsignedToken = $encodedHeader.'.'.$encodedClaims;

        $signature = '';
        $ok = openssl_sign($unsignedToken, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (! $ok) {
            throw new \RuntimeException('Failed to sign JWT for Google OAuth.');
        }

        return $unsignedToken.'.'.$this->base64UrlEncode($signature);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function generateGoogleSheetsCsvExport(
        string $documentType,
        string $fileName,
        string $storedPath,
        string $text
    ): array
    {
        try {
            $filename = sprintf(
                'sheet_export_%s_%s.csv',
                now()->format('Ymd_His'),
                Str::lower(Str::random(6))
            );
            $path = 'exports/'.$filename;

            $stream = fopen('php://temp', 'r+');
            if ($stream === false) {
                throw new \RuntimeException('Failed to create CSV stream.');
            }

            if (in_array($documentType, ['OIL', 'YGN'], true)) {
                $oilRows = $this->extractOilRows($text);
                if ($oilRows === []) {
                    throw new \RuntimeException("No {$documentType} table rows found for CSV export.");
                }
                $metadata = $this->extractDocumentMetadata($text);
                $exchangeInfo = $this->fetchExchangeRatesToUsdRows();

                if ($exchangeInfo['rows'] !== []) {
                    fputcsv($stream, ['', "Exchange Rate Information (as of {$exchangeInfo['as_of']})"]);
                    fputcsv($stream, ['No', 'Currency', 'Rate to USD']);
                    foreach ($exchangeInfo['rows'] as $idx => $rateRow) {
                        fputcsv($stream, [(string) ($idx + 1), $rateRow[0], $rateRow[1]]);
                    }
                    fputcsv($stream, []);
                }

                fputcsv($stream, [
                    'No',
                    'Document No',
                    'Importer (Name & Address)',
                    'Registration No/Valid Date',
                    'Consignor (Name & Address)',
                    'Last Date of Import',
                    'Mode of transport',
                    'Place/Port of discharge',
                    'Licence',
                    'Country Whence Consigned',
                    'Country of Origin',
                    'Method of Import',
                    'Total CIF Value (Kyats)',
                    'Hscode',
                    'Description of Goods',
                    'Unit Code',
                    'Unit Price',
                    'Quantity',
                    'Value(USD)',
                ]);

                foreach ($oilRows as $row) {
                    fputcsv($stream, [
                        $row['no'],
                        $this->stripMyanmarText($metadata['document_no']),
                        $this->stripMyanmarText($metadata['importer']),
                        $this->stripMyanmarText($metadata['registration_valid_date']),
                        $this->stripMyanmarText($metadata['consignor']),
                        $this->stripMyanmarText($metadata['last_date_of_import']),
                        $this->stripMyanmarText($metadata['mode_of_transport']),
                        $this->stripMyanmarText($metadata['place_port_of_discharge']),
                        $this->stripMyanmarText($metadata['licence']),
                        $this->stripMyanmarText($metadata['country_whence_consigned']),
                        $this->stripMyanmarText($metadata['country_of_origin']),
                        $this->stripMyanmarText($metadata['method_of_import']),
                        $this->stripMyanmarText($metadata['total_cif_kyats']),
                        $row['hscode'],
                        $this->stripMyanmarText($row['description']),
                        $row['unit_code'],
                        $this->formatDecimal4($row['unit_price']),
                        $this->formatDecimal4($row['quantity']),
                        $this->formatDecimal4($row['value_usd']),
                    ]);
                }
                fputcsv($stream, [
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    'Total Value',
                    '',
                    '',
                    $this->formatDecimal4($this->extractOilTotalQuantity($text, $oilRows)),
                    $this->formatDecimal4($this->extractOilTotalValueUsd($text, $oilRows)),
                ]);
            } else {
                fputcsv($stream, ['timestamp', 'file_name', 'stored_path', 'extracted_text']);
                fputcsv($stream, [now()->toIso8601String(), $fileName, $storedPath, $text]);
            }
            rewind($stream);
            $csv = stream_get_contents($stream);
            fclose($stream);

            if ($csv === false) {
                throw new \RuntimeException('Failed to build CSV export.');
            }

            Storage::put($path, $csv);

            return [
                'status' => 'success',
                'message' => 'Downloadable Google Sheets file created.',
                'download_url' => route('exports.download', ['filename' => $filename], false),
            ];
        } catch (\Throwable $e) {
            Log::warning('CSV export generation failed', ['error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'message' => $e->getMessage(),
                'download_url' => null,
            ];
        }
    }

    private function extractOilRows(string $text): array
    {
        $normalizedText = str_replace(["\r\n", "\r"], "\n", $text);
        $normalizedText = str_replace('\\n', "\n", $normalizedText);
        $lines = preg_split('/\n/u', $normalizedText) ?: [];
        $rows = [];
        $current = null;

        foreach ($lines as $lineRaw) {
            $line = trim($lineRaw);
            if ($line === '' || str_contains($line, 'about:blank') || str_starts_with($line, '--- Page')) {
                continue;
            }

            if (preg_match('/^(\d{1,3})\s+(\d{8,12})\s+(.+?)\s+([A-Za-z])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/', $line, $m)) {
                if ($current !== null) {
                    $rows[] = $current;
                }
                $current = [
                    'no' => $m[1],
                    'hscode' => $m[2],
                    'description' => $m[3],
                    'unit_code' => strtoupper($m[4]),
                    'unit_price' => $m[5],
                    'quantity' => $m[6],
                    'value_usd' => $m[7],
                ];
                continue;
            }

            if ($current !== null && ! str_starts_with($line, 'Total Value')) {
                if (
                    str_starts_with($line, 'Brand Name')
                    || str_starts_with($line, 'Material')
                    || str_starts_with($line, 'Size')
                ) {
                    $current['description'] .= ' | '.$line;
                }
            }

            if (str_starts_with($line, 'Total Value')) {
                break;
            }
        }

        if ($current !== null) {
            $rows[] = $current;
        }

        return $rows;
    }

    private function extractDocumentMetadata(string $text): array
    {
        $normalizedText = str_replace(["\r\n", "\r"], "\n", $text);
        $metadata = [
            'document_no' => '',
            'importer' => '',
            'registration_valid_date' => '',
            'consignor' => '',
            'last_date_of_import' => '',
            'mode_of_transport' => '',
            'place_port_of_discharge' => '',
            'licence' => '',
            'country_whence_consigned' => '',
            'country_of_origin' => '',
            'method_of_import' => '',
            'total_cif_kyats' => '',
        ];

        if (preg_match('/Licence No\.\s*([A-Z0-9-]+)/i', $normalizedText, $m)) {
            $metadata['licence'] = $m[1];
        }

        if (preg_match('/\b([A-Z]+(?:OBIL)?-\d+-\d+-\d{4})\b/i', $normalizedText, $m)) {
            $metadata['document_no'] = strtoupper($m[1]);
        }

        if (preg_match('/Registration[^\n]*\(.*?Valid.*?Date.*?\)/i', $normalizedText, $m)) {
            $metadata['registration_valid_date'] = trim($m[0]);
        }

        if (preg_match('/1\.\s*Importer \(Name & Address\)(.*?)(?:\n3\.\s*Consignor|\z)/is', $normalizedText, $m)) {
            $importerBlock = (string) $m[1];

            if (preg_match('/^(.*?)7\.\s*Licence No\./is', $importerBlock, $regSeg)) {
                $metadata['registration_valid_date'] = $this->normalizeRegistrationAndDate($regSeg[1]);
            }

            $importerBlock = preg_replace('/^.*?7\.\s*Licence No\.[^\n)]*(?:\([^)]*\))?\s*/is', '', $importerBlock) ?? $importerBlock;
            $importerClean = trim(preg_replace('/\s+/', ' ', $importerBlock) ?? '');
            $importerClean = ltrim($importerClean, " )\t\n\r\0\x0B");
            $metadata['importer'] = $importerClean;
        }

        if (preg_match('/3\.\s*Consignor \(Name & Address\)(.*?)(?:\n4\.\s*Last Date of Import|\z)/is', $normalizedText, $m)) {
            $metadata['consignor'] = trim(preg_replace('/\s+/', ' ', $m[1]) ?? '');
        }

        if (preg_match('/4\.\s*Last Date of Import\s+8\.\s*Country Whence Consigned\s*\n?([^\n]+)/i', $normalizedText, $m)) {
            if (preg_match('/(\d{2}\/\d{2}\/\d{4})\s+(.+)/', trim($m[1]), $parts)) {
                $metadata['last_date_of_import'] = $parts[1];
                $metadata['country_whence_consigned'] = trim($parts[2]);
            }
        }

        if (preg_match('/9\.\s*Country of Origin\s*\n?([^\n]+)/i', $normalizedText, $m)) {
            $metadata['country_of_origin'] = trim($m[1]);
        }

        if (preg_match('/5\.\s*Mode of Transport\s+10\.\s*Method of Import\s*\n?([^\n]+)/i', $normalizedText, $m)) {
            $line = trim($m[1]);
            if (preg_match('/^(Sea|Road|Air)(?:\s+(Sea|Road|Air))?(?:\s+(Sea|Road|Air))?\s+(.*)$/i', $line, $parts)) {
                $modes = array_filter([$parts[1] ?? null, $parts[2] ?? null, $parts[3] ?? null]);
                $metadata['mode_of_transport'] = trim(implode(' ', $modes));
                $metadata['method_of_import'] = trim($parts[4] ?? '');
            } else {
                $metadata['mode_of_transport'] = $line;
            }
        }

        if (preg_match('/6\.\s*Place\/Port of Discharge\s+12\.\s*Total CIF Value \(Kyats\)\s*\n?([^\n]+)/i', $normalizedText, $m)) {
            if (preg_match('/(.+?)\s+([0-9,]+\.\d+)/', trim($m[1]), $parts)) {
                $metadata['place_port_of_discharge'] = trim($parts[1]);
                $metadata['total_cif_kyats'] = trim($parts[2]);
            }
        }

        return $metadata;
    }

    private function normalizeRegistrationAndDate(string $raw): string
    {
        $collapsed = preg_replace('/\s+/', '', $raw) ?? '';
        $withoutLetters = preg_replace('/[A-Za-z]/', '', $collapsed) ?? '';

        $date = '';
        if (preg_match('/(\d{2})\/+(\d{2})\/+(\d{4})/', $withoutLetters, $dm)) {
            $date = "{$dm[1]}/{$dm[2]}/{$dm[3]}";
        }

        $beforeParen = strstr($withoutLetters, '(', true);
        $beforeParen = $beforeParen === false ? $withoutLetters : $beforeParen;
        $digits = preg_replace('/[^0-9]/', '', $beforeParen) ?? '';

        // OCR often prefixes this value with a section marker digit.
        if (strlen($digits) === 10 && str_starts_with($digits, '2')) {
            $digits = substr($digits, 1);
        }

        if ($digits === '' && $date === '') {
            return '';
        }
        if ($date === '') {
            return $digits;
        }
        if ($digits === '') {
            return $date;
        }

        return "{$digits} ({$date})";
    }

    private function extractOilTotalValueUsd(string $text, array $oilRows): string
    {
        if (preg_match('/Total\s+Value\s+[A-Za-z]\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i', $text, $m)) {
            return $m[1];
        }

        $sum = 0.0;
        foreach ($oilRows as $row) {
            $sum += (float) ($row['value_usd'] ?? 0);
        }

        return number_format($sum, 4, '.', '');
    }

    private function extractOilTotalQuantity(string $text, array $oilRows): string
    {
        if (preg_match('/Total\s+Value\s+[A-Za-z]\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?/i', $text, $m)) {
            return $m[1];
        }

        $sum = 0.0;
        foreach ($oilRows as $row) {
            $sum += (float) ($row['quantity'] ?? 0);
        }

        return number_format($sum, 4, '.', '');
    }

    private function formatDecimal4(string $value): string
    {
        $trimmed = trim($value);
        if (! preg_match('/^-?\d+(?:\.\d+)?$/', $trimmed)) {
            return $trimmed;
        }

        return number_format((float) $trimmed, 4, '.', '');
    }

    private function asSheetTextDecimal4(string $value): string
    {
        return $this->formatDecimal4($value);
    }

    private function fetchExchangeRatesToUsdRows(): array
    {
        $symbols = ['CNY', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD'];
        $labelMap = [
            'CNY' => 'China (CNY)',
            'EUR' => 'Euro (EUR)',
            'JPY' => 'Japanese Yen (JPY)',
            'GBP' => 'British Pound (GBP)',
            'CAD' => 'Canadian Dollar (CAD)',
            'AUD' => 'Australian Dollar (AUD)',
        ];
        $defaultAsOf = now()->format('F j, Y');
        $provider = strtolower(trim((string) env('FX_PROVIDER', '')));
        $apiKey = trim((string) env('FX_API_KEY', ''));
        $urls = [
            'https://api.frankfurter.dev/v1/latest',
            'https://api.frankfurter.app/latest',
        ];

        try {
            if ($provider === 'exchangerate_api') {
                if ($apiKey === '') {
                    Log::warning('FX_PROVIDER is exchangerate_api but FX_API_KEY is missing.');
                    return ['as_of' => $defaultAsOf, 'rows' => []];
                }

                $response = Http::timeout(10)->get("https://v6.exchangerate-api.com/v6/{$apiKey}/latest/USD");
                if (! $response->successful()) {
                    Log::warning('ExchangeRate-API request failed', ['status' => $response->status(), 'body' => $response->body()]);
                    return ['as_of' => $defaultAsOf, 'rows' => []];
                }

                $result = (string) $response->json('result');
                if ($result !== 'success') {
                    Log::warning('ExchangeRate-API response not successful', ['result' => $result, 'body' => $response->body()]);
                    return ['as_of' => $defaultAsOf, 'rows' => []];
                }

                $rates = (array) $response->json('conversion_rates', []);
                $rows = [];
                foreach ($symbols as $symbol) {
                    $rateFromUsd = isset($rates[$symbol]) ? (float) $rates[$symbol] : 0.0;
                    if ($rateFromUsd <= 0) {
                        continue;
                    }
                    $toUsd = 1 / $rateFromUsd;
                    $rows[] = [$labelMap[$symbol], $this->formatExchangeRate($toUsd)];
                }

                return ['as_of' => $defaultAsOf, 'rows' => $rows];
            }

            foreach ($urls as $url) {
                $response = Http::timeout(10)->get($url, [
                    'base' => 'USD',
                    'symbols' => implode(',', $symbols),
                ]);
                if (! $response->successful()) {
                    continue;
                }

                $date = (string) $response->json('date');
                $asOf = $date !== '' ? date('F j, Y', strtotime($date)) : $defaultAsOf;
                $rates = (array) $response->json('rates', []);
                $rows = [];

                foreach ($symbols as $symbol) {
                    $rateFromUsd = isset($rates[$symbol]) ? (float) $rates[$symbol] : 0.0;
                    if ($rateFromUsd <= 0) {
                        continue;
                    }
                    $toUsd = 1 / $rateFromUsd;
                    $rows[] = [$labelMap[$symbol], $this->formatExchangeRate($toUsd)];
                }

                if ($rows !== []) {
                    return ['as_of' => $asOf, 'rows' => $rows];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Exchange rate fetch failed', ['error' => $e->getMessage()]);
        }

        Log::warning('Exchange rate fetch unavailable, no exchange rows will be inserted.');
        return ['as_of' => $defaultAsOf, 'rows' => []];
    }

    private function formatExchangeRate(float $value): string
    {
        $formatted = number_format($value, 6, '.', '');
        return rtrim(rtrim($formatted, '0'), '.');
    }

    private function extractConditionsText(string $text): string
    {
        $normalizedText = str_replace(["\r\n", "\r"], "\n", $text);
        if (! preg_match('/22\.\s*Conditions(.*?)(?:\n23\s+Revenue Stamp|\z)/is', $normalizedText, $m)) {
            return '';
        }

        $block = trim($m[1]);
        if ($block === '') {
            return '';
        }

        $lines = preg_split('/\n/u', $block) ?: [];
        $kept = [];
        $collecting = false;

        foreach ($lines as $lineRaw) {
            $line = trim($lineRaw);
            if ($line === '') {
                continue;
            }
            $line = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $line) ?? $line;
            $line = trim(preg_replace('/\s+/', ' ', $line) ?? $line);

            if (preg_match('/^(for DIRECTOR GENERAL|Stamp|Online Fees Voucher|about:blank)/i', $line)) {
                continue;
            }

            if (preg_match('/\bMV-[A-Z0-9-]+\b/i', $line)) {
                $collecting = true;
            }

            if (! $collecting) {
                continue;
            }

            if (preg_match('/^(21\.|Name\s*:|Designation\s*:|Date\s*:)/i', $line)) {
                continue;
            }

            $kept[] = $line;
        }

        if ($kept === []) {
            foreach ($lines as $lineRaw) {
                $line = trim($lineRaw);
                if ($line === '') {
                    continue;
                }
                if (
                    preg_match('/\bMV-[A-Z0-9-]+\b/i', $line)
                    || preg_match('/FESC\s*\(/i', $line)
                    || preg_match('/Bank Account No/i', $line)
                    || preg_match('/\bEarning\b/i', $line)
                    || preg_match('/[\x{1000}-\x{109F}\x{AA60}-\x{AA7F}\x{A9E0}-\x{A9FF}]/u', $line)
                ) {
                    $line = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $line) ?? $line;
                    $kept[] = trim(preg_replace('/\s+/', ' ', $line) ?? $line);
                }
            }
        }

        return implode("\n", $kept);
    }

    private function stripMyanmarText(string $value): string
    {
        $clean = preg_replace('/[\x{1000}-\x{109F}\x{AA60}-\x{AA7F}\x{A9E0}-\x{A9FF}]/u', '', $value) ?? $value;
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $clean) ?? $clean;
        return trim(preg_replace('/\s+/', ' ', $clean) ?? $clean);
    }

}
