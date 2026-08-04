<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $admins = [
            [
                'name' => env('ADMIN_ONE_NAME', 'Admin One'),
                'email' => env('ADMIN_ONE_EMAIL', 'admin1@example.com'),
                'password' => env('ADMIN_ONE_PASSWORD', 'change-me-admin-one'),
                'visible' => filter_var(env('ADMIN_ONE_VISIBLE', true), FILTER_VALIDATE_BOOL),
                'oil_spreadsheet_id' => env('ADMIN_ONE_OIL_SPREADSHEET_ID'),
                'ygn_spreadsheet_id' => env('ADMIN_ONE_YGN_SPREADSHEET_ID'),
            ],
            [
                'name' => env('ADMIN_TWO_NAME', 'Admin Two'),
                'email' => env('ADMIN_TWO_EMAIL', 'admin2@example.com'),
                'password' => env('ADMIN_TWO_PASSWORD', 'change-me-admin-two'),
                'visible' => filter_var(env('ADMIN_TWO_VISIBLE', false), FILTER_VALIDATE_BOOL),
                'oil_spreadsheet_id' => env('ADMIN_TWO_OIL_SPREADSHEET_ID'),
                'ygn_spreadsheet_id' => env('ADMIN_TWO_YGN_SPREADSHEET_ID'),
            ],
        ];

        foreach ($admins as $admin) {
            User::updateOrCreate(
                ['email' => $admin['email']],
                $admin
            );
        }
    }
}
