<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('visible')->default(false)->after('password');
            $table->string('oil_spreadsheet_id')->nullable()->after('visible');
            $table->string('ygn_spreadsheet_id')->nullable()->after('oil_spreadsheet_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'visible',
                'oil_spreadsheet_id',
                'ygn_spreadsheet_id',
            ]);
        });
    }
};
