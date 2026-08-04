<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class AdminAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = trim((string) $request->bearerToken());
        if ($token === '') {
            $token = trim((string) $request->query('token', ''));
        }

        $payload = $token === '' ? null : Cache::get('admin_auth_token:'.$token);
        $user = is_array($payload) ? User::find($payload['user_id'] ?? null) : null;

        if (! $user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $request->attributes->set('admin_user', $user);

        return $next($request);
    }
}
