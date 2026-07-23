<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trainees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intake_id')->nullable()->constrained()->nullOnDelete();
            $table->string('full_name');
            $table->string('phone_number');
            $table->integer('age');
            $table->string('id_number')->unique();

            // Tailoring Profile
            $table->boolean('has_tailoring_experience')->default(false);
            $table->string('previous_company')->nullable();

            // Required Documents Checklist
            $table->boolean('has_original_id_and_copies')->default(false);
            $table->boolean('has_passport_photos')->default(false);
            $table->boolean('has_insurance_cover')->default(false);

            // Training Schedule & Pipeline Status
            $table->date('join_date')->nullable();
            $table->date('end_date')->nullable();
            $table->enum('status', ['registered', 'in_training', 'finished'])->default('registered');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trainees');
    }
};
