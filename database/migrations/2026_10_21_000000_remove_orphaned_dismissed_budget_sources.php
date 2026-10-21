<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (DB::table('tenants')->orderBy('id')->lazyById() as $tenant) {
            DB::transaction(function () use ($tenant): void {
                DB::table('tenants')->where('id', $tenant->id)->lockForUpdate()->first();
                foreach (DB::table('budget_years')->where('tenant_id', $tenant->id)->whereNotNull('dismissed_sources')->orderBy('id')->lockForUpdate()->get() as $year) {
                    $sources = json_decode($year->dismissed_sources, true, flags: JSON_THROW_ON_ERROR);
                    $kept = array_values(array_filter($sources, function ($source) use ($tenant): bool {
                        // Only repair recognized orphan references; leave malformed data to the validators.
                        if (! is_string($source) || ! preg_match('/^(expense|contract|project):([1-9][0-9]*)$/D', $source, $match)) {
                            return true;
                        }

                        return DB::table($match[1].'s')->where('tenant_id', $tenant->id)->where('id', $match[2])->exists();
                    }));
                    if ($kept !== $sources) {
                        DB::table('budget_years')->where('id', $year->id)->update(['dismissed_sources' => json_encode($kept, JSON_THROW_ON_ERROR)]);
                    }
                }
            });
        }
    }

    public function down(): void
    {
        // Deleted sources cannot be reconstructed; never reintroduce dangling references.
    }
};
