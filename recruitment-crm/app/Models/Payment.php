<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use HasFactory;

    protected $fillable = [
        'trainee_id',
        'amount',
        'payment_date',
        'reference_number',
    ];

    public function trainee()
    {
        return $this->belongsTo(Trainee::class);
    }
}
