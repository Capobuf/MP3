<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use Illuminate\Http\JsonResponse;

class CreationOptionsController extends Controller
{
    public function __invoke(Tenant $tenant): JsonResponse
    {
        return response()->json(['options' => ExpenseOverview::options($tenant)]);
    }
}
