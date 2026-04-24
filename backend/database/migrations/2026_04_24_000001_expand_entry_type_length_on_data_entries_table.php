<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE data_entries ALTER COLUMN entry_type TYPE VARCHAR(120)');
            return;
        }

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE data_entries MODIFY entry_type VARCHAR(120)');
            return;
        }

        if ($driver === 'sqlite') {
            // SQLite does not enforce VARCHAR length, so no schema change is required.
            return;
        }

        throw new RuntimeException('Unsupported DB driver for entry_type migration: '.$driver);
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE data_entries ALTER COLUMN entry_type TYPE VARCHAR(20)');
            return;
        }

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE data_entries MODIFY entry_type VARCHAR(20)');
            return;
        }

        if ($driver === 'sqlite') {
            return;
        }

        throw new RuntimeException('Unsupported DB driver for entry_type migration rollback: '.$driver);
    }
};
