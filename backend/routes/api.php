<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DataEntryController;
use App\Http\Controllers\PdfController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('admin.auth');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('admin.auth');

Route::middleware('admin.auth')->group(function () {
    Route::post('/upload', [PdfController::class, 'upload']);
    Route::post('/fix-document-dates', [PdfController::class, 'fixDocumentDates']);
    Route::get('/exports/{filename}', [PdfController::class, 'downloadExport'])
        ->where('filename', '[A-Za-z0-9._-]+')
        ->name('exports.download');
    Route::get('/data-entries', [DataEntryController::class, 'index']);
    Route::get('/data-entries/product-names', [DataEntryController::class, 'productNames']);
    Route::post('/data-entries', [DataEntryController::class, 'store']);
    Route::post('/data-entries/bulk', [DataEntryController::class, 'bulkStore']);
    Route::put('/data-entries/{dataEntry}', [DataEntryController::class, 'update']);
    Route::delete('/data-entries/{dataEntry}', [DataEntryController::class, 'destroy']);
    Route::post('/data-entries/reorder', [DataEntryController::class, 'reorder']);
});
