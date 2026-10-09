<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class CreateSuperuser extends Command
{
    protected $signature = 'app:create-superuser';

    protected $description = 'Create a global superuser account';

    public function handle(): int
    {
        $name = trim((string) $this->ask('Name'));
        $email = Str::lower(trim((string) $this->ask('Email')));

        if (User::query()->whereRaw('lower(email) = ?', [$email])->exists()) {
            $this->error('An account with this email already exists. It was not modified.');

            return self::FAILURE;
        }

        $password = (string) $this->secret('Password');
        $passwordConfirmation = (string) $this->secret('Confirm password');

        $validator = Validator::make([
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $passwordConfirmation,
        ], [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::default(), 'confirmed'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
        ]);
        $user->is_super_admin = true;
        $user->save();

        $this->info('Superuser created successfully.');

        return self::SUCCESS;
    }
}
