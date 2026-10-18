<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->json('contract_reminders')->nullable();
        });
        Schema::create('contract_reminder_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('recipient', 254);
            $table->string('notification_key', 100);
            $table->string('status', 10);
            $table->timestamp('sent_at')->nullable();
            $table->unique(['tenant_id', 'recipient', 'notification_key'], 'contract_reminder_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_reminder_deliveries');
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn('contract_reminders'));
    }
};
