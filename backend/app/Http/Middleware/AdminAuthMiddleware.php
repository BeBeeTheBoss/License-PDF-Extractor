<?php

namespace App\Http\Middleware;

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

        if ($token === '' || ! Cache::has('admin_auth_token:'.$token)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}

