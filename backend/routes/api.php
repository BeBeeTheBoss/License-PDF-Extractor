<?php

use App\Http\Controllers\PdfController;
use Illuminate\Support\Facades\Route;

Route::post('/upload', [PdfController::class, 'upload']);
Route::get('/exports/{filename}', [PdfController::class, 'downloadExport'])
    ->where('filename', '[A-Za-z0-9._-]+')
    ->name('exports.download');
