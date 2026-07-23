<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Trainee extends Model
{
    use HasFactory;

    protected $fillable = [
        'intake_id',
        'full_name',
        'phone_number',
        'age',
        'id_number',
        'has_tailoring_experience',
        'previous_company',
        'has_original_id_and_copies',
        'has_passport_photos',
        'has_insurance_cover',
        'join_date',
        'end_date',
        'status',
    ];

    // Trainee belongs to a batch
    public function intake()
    {
        return $this->belongsTo(Intake::class);
    }

    // Trainee can make multiple payments
    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
