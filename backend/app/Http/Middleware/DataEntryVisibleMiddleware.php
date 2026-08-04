<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DataEntryVisibleMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('admin_user');

        if (! $user || ! $user->visible) {
            return response()->json(['message' => 'Data Entry access is not available.'], 403);
        }

        return $next($request);
    }
}
