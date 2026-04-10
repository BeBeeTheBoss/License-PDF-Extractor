<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_entries', function (Blueprint $table) {
            $table->unsignedInteger('sort_order')->nullable()->after('pi_no');
        });

        $entries = DB::table('data_entries')->orderBy('id')->get(['id']);
        $order = 1;
        foreach ($entries as $entry) {
            DB::table('data_entries')->where('id', $entry->id)->update(['sort_order' => $order]);
            $order++;
        }

        Schema::table('data_entries', function (Blueprint $table) {
            $table->index('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('data_entries', function (Blueprint $table) {
            $table->dropIndex(['sort_order']);
            $table->dropColumn('sort_order');
        });
    }
};
