<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataEntry extends Model
{
    protected $fillable = [
        'entry_type',
        'bl_no',
        'product_name',
        'sea_shipment_size',
        'sea_shipment_qty',
        'etd',
        'eta_ygn',
        'file_status',
        'remark',
        'issue_date',
        'pi_no',
        'sort_order',
    ];

    protected $casts = [
        'sea_shipment_qty' => 'integer',
        'etd' => 'date',
        'eta_ygn' => 'date',
        'issue_date' => 'date',
    ];
}
