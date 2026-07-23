<?php

namespace App\Http\Controllers;

use App\Models\Trainee;
use Illuminate\Http\Request;

class TraineeController extends Controller
{
    // Fetch trainees with search, filter, and payment details
    public function index(Request $request)
    {
        $query = Trainee::with(['intake', 'payments']);

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                  ->orWhere('phone_number', 'like', "%{$search}%")
                  ->orWhere('id_number', 'like', "%{$search}%");
            });
        }

        if ($request->has('intake_id')) {
            $query->where('intake_id', $request->intake_id);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    // Register a new trainee
    public function store(Request $request)
    {
        $validated = $request->validate([
            'intake_id' => 'required|exists:intakes,id',
            'full_name' => 'required|string|max:150',
            'phone_number' => 'required|string|max:20',
            'age' => 'required|integer|min:18|max:26',
            'id_number' => 'required|string|unique:trainees,id_number',
            'has_tailoring_experience' => 'boolean',
            'previous_company' => 'nullable|string|max:150',
            'has_original_id_and_copies' => 'boolean',
            'has_passport_photos' => 'boolean',
            'has_insurance_cover' => 'boolean',
            'join_date' => 'required|date',
            'end_date' => 'nullable|date',
            'status' => 'in:registered,in_training,finished',
        ]);

        $trainee = Trainee::create($validated);

        return response()->json([
            'message' => 'Trainee registered successfully!',
            'data' => $trainee
        ], 201);
    }

    // View single trainee profile
    public function show($id)
    {
        $trainee = Trainee::with(['intake', 'payments'])->findOrFail($id);
        return response()->json($trainee);
    }
}
