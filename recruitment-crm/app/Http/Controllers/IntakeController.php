<?php

namespace App\Http\Controllers;

use App\Models\Intake;
use Illuminate\Http\Request;

class IntakeController extends Controller
{
    // List all intake batches with trainee counts
    public function index()
    {
        $intakes = Intake::withCount('trainees')->orderBy('created_at', 'desc')->get();
        return response()->json($intakes);
    }

    // Create a new intake batch (e.g., "August 2026 Batch")
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'target_capacity' => 'required|integer|min:1',
        ]);

        $intake = Intake::create($validated);

        return response()->json([
            'message' => 'Intake batch created successfully!',
            'data' => $intake
        ], 201);
    }
}
