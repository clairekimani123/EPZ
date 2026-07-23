<?php
use App\Http\Controllers\IntakeController;
use App\Http\Controllers\TraineeController;
use App\Http\Controllers\PaymentController;
use Illuminate\Support\Facades\Route;

// Intake Batch Routes
Route::get('/intakes', [IntakeController::class, 'index']);
Route::post('/intakes', [IntakeController::class, 'store']);

// Trainee Routes
Route::get('/trainees', [TraineeController::class, 'index']);
Route::post('/trainees', [TraineeController::class, 'store']);
Route::get('/trainees/{id}', [TraineeController::class, 'show']);

// Payment Routes
Route::post('/payments', [PaymentController::class, 'store']);



Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});
