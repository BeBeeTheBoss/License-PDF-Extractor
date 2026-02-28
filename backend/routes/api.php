<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PdfController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('admin.auth');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('admin.auth');

Route::middleware('admin.auth')->group(function () {
    Route::post('/upload', [PdfController::class, 'upload']);
    Route::get('/exports/{filename}', [PdfController::class, 'downloadExport'])
        ->where('filename', '[A-Za-z0-9._-]+')
        ->name('exports.download');
});
