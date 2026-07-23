<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    // Record a payment for a trainee
    public function store(Request $request)
    {
        $validated = $request->validate([
            'trainee_id' => 'required|exists:trainees,id',
            'amount' => 'required|numeric|min:0',
            'payment_date' => 'required|date',
            'reference_number' => 'nullable|string|max:100',
        ]);

        $payment = Payment::create($validated);

        return response()->json([
            'message' => 'Payment recorded successfully!',
            'data' => $payment
        ], 201);
    }
}
