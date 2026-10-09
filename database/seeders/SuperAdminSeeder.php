<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class SuperAdminSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $username = (string) config('super-admin.username');
        $password = (string) config('super-admin.password');

        if ($username === '' || $password === '') {
            throw new RuntimeException('SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD are required.');
        }

        if ($username !== $password) {
            throw new RuntimeException('SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD must be identical.');
        }

        if (filter_var($username, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('SUPER_ADMIN_USERNAME must be a valid email address for Fortify login.');
        }

        User::updateOrCreate(
            ['email' => $username],
            [
                'name' => (string) config('super-admin.name'),
                'password' => $password,
                'email_verified_at' => now(),
                'is_super_admin' => true,
            ],
        );
    }
}
