<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('data_entries', 'importer_name')) {
            Schema::table('data_entries', function (Blueprint $table) {
                $table->string('importer_name')->nullable()->after('entry_type');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('data_entries', 'importer_name')) {
            Schema::table('data_entries', function (Blueprint $table) {
                $table->dropColumn('importer_name');
            });
        }
    }
};
