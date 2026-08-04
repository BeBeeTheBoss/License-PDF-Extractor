<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $email = trim((string) $request->input('email'));
        $password = (string) $request->input('password');
        $user = User::query()->where('email', $email)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $token = Str::random(80);
        $ttlMinutes = max(5, (int) env('ADMIN_TOKEN_TTL_MINUTES', 720));
        Cache::put($this->tokenKey($token), [
            'user_id' => $user->id,
        ], now()->addMinutes($ttlMinutes));

        return response()->json([
            'message' => 'Login successful.',
            'token' => $token,
            'email' => $user->email,
            'visible' => $user->visible,
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

        $user = User::find($payload['user_id'] ?? null);
        if (! $user) {
            Cache::forget($this->tokenKey($token));
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return response()->json([
            'email' => $user->email,
            'visible' => $user->visible,
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
