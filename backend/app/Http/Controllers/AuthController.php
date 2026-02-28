<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $adminEmail = trim((string) env('ADMIN_EMAIL', 'admin@gmail.com'));
        $adminPassword = (string) env('ADMIN_PASSWORD', '123456');

        $email = trim((string) $request->input('email'));
        $password = (string) $request->input('password');

        if (! hash_equals(Str::lower($adminEmail), Str::lower($email)) || ! hash_equals($adminPassword, $password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $token = Str::random(80);
        $ttlMinutes = max(5, (int) env('ADMIN_TOKEN_TTL_MINUTES', 720));
        Cache::put($this->tokenKey($token), [
            'email' => $adminEmail,
        ], now()->addMinutes($ttlMinutes));

        return response()->json([
            'message' => 'Login successful.',
            'token' => $token,
            'email' => $adminEmail,
            'expires_in_minutes' => $ttlMinutes,
        ]);
    }

    public function me(Request $request)
    {
        $token = $this->extractToken($request);
        if ($token === '') {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $payload = Cache::get($this->tokenKey($token));
        if (! is_array($payload)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return response()->json([
            'email' => (string) ($payload['email'] ?? ''),
        ]);
    }

    public function logout(Request $request)
    {
        $token = $this->extractToken($request);
        if ($token !== '') {
            Cache::forget($this->tokenKey($token));
        }

        return response()->json([
            'message' => 'Logged out.',
        ]);
    }

    private function extractToken(Request $request): string
    {
        $bearer = trim((string) $request->bearerToken());
        if ($bearer !== '') {
            return $bearer;
        }

        return trim((string) $request->query('token', ''));
    }

    private function tokenKey(string $token): string
    {
        return 'admin_auth_token:'.$token;
    }
}

