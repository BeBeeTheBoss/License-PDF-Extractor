<?php

namespace App\Http\Controllers;

use App\Models\DataEntry;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DataEntryController extends Controller
{
    private const ENTRY_TYPES = [
        'Steel',
        'Roofing/Ceiling/Wall',
        'Sanitary Ware',
        'Garden And Accessories',
        'Hardware And Tools',
        'Surface Covering',
        'Door, Windows And Wood',
        'Electrical And Accessories',
        'Home Appliance',
        'Paint And Chemical',
        'Houseware And Kitchen',
        'Furniture And Bedding',
        'Stationery & Digital Equipment',
        'CT',
        'DAP',
        'Other',
    ];

    public function index(Request $request)
    {
        $query = DataEntry::query()
            ->orderBy('sort_order')
            ->orderBy('id');

        $limit = (int) $request->query('limit', 0);
        if ($limit > 0) {
            if ($limit > 2000) {
                $limit = 2000;
            }
            $query->limit($limit);
        }

        $entries = $query->get();

        return response()->json([
            'data' => $entries,
        ]);
    }

    public function productNames()
    {
        $names = DataEntry::query()
            ->select('product_name')
            ->distinct()
            ->orderBy('product_name')
            ->pluck('product_name');

        return response()->json([
            'data' => $names,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'entry_type' => ['required', 'string', Rule::in(self::ENTRY_TYPES)],
            'bl_no' => ['required', 'string', 'max:255'],
            'product_name' => ['required', 'string', 'max:255'],
            'sea_shipment_size' => ['nullable', 'string', 'in:20,40', 'required_with:sea_shipment_qty'],
            'sea_shipment_qty' => ['nullable', 'integer', 'min:1', 'required_with:sea_shipment_size'],
            'etd' => ['required', 'date'],
            'eta_ygn' => ['nullable', 'date'],
            'file_status' => ['required', 'string', 'in:Arrive Port,Run,Finished'],
            'remark' => ['nullable', 'string'],
            'issue_date' => ['nullable', 'date'],
            'pi_no' => ['required', 'string', 'max:255'],
        ]);

        foreach (['entry_type', 'bl_no', 'product_name', 'file_status', 'remark', 'pi_no'] as $field) {
            if (array_key_exists($field, $validated) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }

        $nextOrder = (int) DataEntry::max('sort_order');
        $validated['sort_order'] = $nextOrder + 1;

        $entry = DataEntry::create($validated);

        return response()->json([
            'message' => 'Data entry saved.',
            'data' => $entry,
        ], 201);
    }

    public function bulkStore(Request $request)
    {
        $validated = $request->validate([
            'entries' => ['required', 'array', 'min:1'],
            'entries.*.entry_type' => ['required', 'string', Rule::in(self::ENTRY_TYPES)],
            'entries.*.bl_no' => ['required', 'string', 'max:255'],
            'entries.*.product_name' => ['required', 'string', 'max:255'],
            'entries.*.sea_shipment_size' => ['nullable', 'string', 'in:20,40', 'required_with:entries.*.sea_shipment_qty'],
            'entries.*.sea_shipment_qty' => ['nullable', 'integer', 'min:1', 'required_with:entries.*.sea_shipment_size'],
            'entries.*.etd' => ['required', 'date'],
            'entries.*.eta_ygn' => ['nullable', 'date'],
            'entries.*.file_status' => ['required', 'string', 'in:Arrive Port,Run,Finished'],
            'entries.*.remark' => ['nullable', 'string'],
            'entries.*.issue_date' => ['nullable', 'date'],
            'entries.*.pi_no' => ['required', 'string', 'max:255'],
        ]);

        $entries = collect($validated['entries'])->map(function ($entry) {
            foreach (['entry_type', 'bl_no', 'product_name', 'file_status', 'remark', 'pi_no'] as $field) {
                if (array_key_exists($field, $entry) && is_string($entry[$field])) {
                    $entry[$field] = trim($entry[$field]);
                }
            }
            return $entry;
        });

        $nextOrder = (int) DataEntry::max('sort_order');
        $offset = 0;
        $created = DataEntry::insert(
            $entries->map(function ($entry) use ($nextOrder, &$offset) {
                $offset++;
                return [
                    ...$entry,
                    'created_at' => now(),
                    'updated_at' => now(),
                    'sort_order' => $nextOrder + $offset,
                ];
            })->all()
        );

        return response()->json([
            'message' => 'Entries saved.',
            'saved' => $entries->count(),
        ], 201);
    }

    public function update(Request $request, DataEntry $dataEntry)
    {
        $validated = $request->validate([
            'entry_type' => ['required', 'string', Rule::in(self::ENTRY_TYPES)],
            'bl_no' => ['required', 'string', 'max:255'],
            'product_name' => ['required', 'string', 'max:255'],
            'sea_shipment_size' => ['nullable', 'string', 'in:20,40', 'required_with:sea_shipment_qty'],
            'sea_shipment_qty' => ['nullable', 'integer', 'min:1', 'required_with:sea_shipment_size'],
            'etd' => ['required', 'date'],
            'eta_ygn' => ['nullable', 'date'],
            'file_status' => ['required', 'string', 'in:Arrive Port,Run,Finished'],
            'remark' => ['nullable', 'string'],
            'issue_date' => ['nullable', 'date'],
            'pi_no' => ['required', 'string', 'max:255'],
        ]);

        foreach (['entry_type', 'bl_no', 'product_name', 'file_status', 'remark', 'pi_no'] as $field) {
            if (array_key_exists($field, $validated) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }

        $dataEntry->update($validated);

        return response()->json([
            'message' => 'Entry updated.',
            'data' => $dataEntry->fresh(),
        ]);
    }

    public function destroy(DataEntry $dataEntry)
    {
        $dataEntry->delete();

        return response()->json([
            'message' => 'Entry deleted.',
        ]);
    }

    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['integer'],
        ]);

        $ids = array_values(array_unique($validated['ordered_ids']));

        \DB::transaction(function () use ($ids) {
            foreach ($ids as $index => $id) {
                DataEntry::where('id', $id)->update(['sort_order' => $index + 1]);
            }
        });

        return response()->json([
            'message' => 'Order saved.',
        ]);
    }
}
