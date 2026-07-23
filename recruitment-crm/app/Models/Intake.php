<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Intake extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'target_capacity'];

    public function trainees()
    {
        return $this->hasMany(Trainee::class);
    }
}
