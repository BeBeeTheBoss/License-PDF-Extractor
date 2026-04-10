<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_entries', function (Blueprint $table) {
            $table->id();
            $table->string('entry_type', 20);
            $table->string('bl_no');
            $table->string('product_name');
            $table->string('sea_shipment_size', 10)->nullable();
            $table->unsignedInteger('sea_shipment_qty')->nullable();
            $table->date('etd')->nullable();
            $table->date('eta_ygn')->nullable();
            $table->string('file_status', 30);
            $table->text('remark')->nullable();
            $table->date('issue_date')->nullable();
            $table->string('pi_no');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_entries');
    }
};
