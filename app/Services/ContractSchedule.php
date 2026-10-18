<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\Tenant;
use App\Notifications\GeneralNotification;
use App\Support\CatalogQuery;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

class ContractSchedule
{
    public const TIMEZONE = 'Europe/Rome';

    public const HOUR = 8;

    public const DEFAULTS = ['enabled' => false, 'mode' => 'expiry', 'days' => [7, 30], 'monthly_day' => 1, 'user_ids' => [], 'external_emails' => []];

    /** @return array<string, mixed> */
    public function settings(Tenant $tenant): array
    {
        return $tenant->contract_reminders ?? self::DEFAULTS;
    }

    /** @return Collection<int, Contract> */
    public function listing(Tenant $tenant, Request $request): Collection
    {
        $query = CatalogQuery::filtered($tenant, 'contracts', $request);
        $today = CarbonImmutable::now(self::TIMEZONE)->startOfDay();
        match ($request->input('period')) {
            'expired' => $query->where('ends_on', '<', $today->toDateString()),
            '30', '60', '90' => $query->whereBetween('ends_on', [$today->toDateString(), $today->addDays($request->integer('period'))->toDateString()]),
            'undated' => $query->whereNull('ends_on'),
            default => null,
        };

        /** @var Collection<int, Contract> */
        return $query->orderByRaw('ends_on IS NULL')->orderBy('ends_on')->orderBy('id')->get();
    }

    /** @param array<string, mixed> $settings
     * @return array<int, string>
     */
    public function recipients(Tenant $tenant, array $settings): array
    {
        return $tenant->users()->whereIn('users.id', $settings['user_ids'])->pluck('email')
            ->merge($settings['external_emails'])->map(fn ($email) => mb_strtolower(trim($email)))
            ->filter(fn ($email) => filter_var($email, FILTER_VALIDATE_EMAIL) !== false)->unique()->sort()->values()->all();
    }

    /** @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function preview(Tenant $tenant, array $settings): array
    {
        $now = CarbonImmutable::now(self::TIMEZONE);
        $until = $now->addYear()->endOfDay();
        $saved = $this->settings($tenant);
        if (array_intersect_key($saved, self::DEFAULTS) == $settings) {
            $settings = $saved;
            $now = $now->startOfDay();
        }
        $recipients = $this->recipients($tenant, $settings);

        return [
            'enabled' => $settings['enabled'], 'recipients' => $recipients,
            'pending' => DB::table('contract_reminder_deliveries')->where('tenant_id', $tenant->id)->where('status', 'pending')->count(),
            'timezone' => self::TIMEZONE, 'until' => $until->toDateString(),
            'notifications' => $this->calendar($tenant, $settings, $now, $until),
        ];
    }

    /** @param array<string, mixed> $settings
     * @return list<array<string, mixed>>
     */
    public function calendar(Tenant $tenant, array $settings, CarbonImmutable $from, CarbonImmutable $until): array
    {
        if (isset($settings['starts_at'])) {
            $from = $from->max(CarbonImmutable::parse($settings['starts_at']));
        }
        $recipients = $this->recipients($tenant, $settings);
        if (! $settings['enabled'] || $recipients === []) {
            return [];
        }
        $contracts = $tenant->contracts()->get()->keyBy('id');
        $eligible = $contracts->filter(fn (Contract $c) => $c->ends_on !== null && $c->year !== null && $c->year === CarbonImmutable::parse($c->getRawOriginal('ends_on'))->year);
        $sent = DB::table('contract_reminder_deliveries')->where('tenant_id', $tenant->id)->where('status', '!=', 'failed')->get()
            ->groupBy('recipient')->map(fn ($rows) => $rows->pluck('notification_key')->flip());
        $groups = [];
        foreach ($eligible as $contract) {
            $root = $contract;
            $visited = [];
            while ($root->source_contract_id && isset($contracts[$root->source_contract_id]) && ! isset($visited[$root->id])) {
                $visited[$root->id] = true;
                $root = $contracts[$root->source_contract_id];
            }
            $end = CarbonImmutable::parse($contract->getRawOriginal('ends_on'), self::TIMEZONE);
            $dates = [];
            if ($settings['mode'] === 'monthly') {
                $date = $end->startOfMonth()->day($settings['monthly_day'])->hour(self::HOUR);
                if ($date->startOfDay()->gt($end)) {
                    $date = $date->subMonthNoOverflow();
                }
                $dates[] = [$date, 'monthly:'.$date->format('Y-m'), null];
            } else {
                foreach ($settings['days'] as $days) {
                    $dates[] = [$end->subDays($days)->hour(self::HOUR), 'expiry:'.$root->id.':'.$end->toDateString().':'.$days, $days];
                }
            }
            foreach ($dates as [$date, $key, $days]) {
                if ($date->lt($from) || $date->gt($until)) {
                    continue;
                }
                foreach ($recipients as $recipient) {
                    $batchKey = $settings['mode'] === 'monthly' ? $key : 'expiry-day:'.$date->toDateString();
                    if (isset($sent[$recipient][$key]) || isset($sent[$recipient][$batchKey])) {
                        continue;
                    }
                    $groupKey = $date->toDateString().'|'.$recipient;
                    $groups[$groupKey] ??= [
                        'batch_key' => $batchKey,
                        'date' => $date->toDateString(), 'mode' => $settings['mode'],
                        'window_end' => $settings['mode'] === 'monthly' ? $date->addMonthNoOverflow()->subDay()->toDateString() : null,
                        'recipient' => $recipient, 'contracts' => [],
                    ];
                    $identity = $root->id.':'.$end->toDateString();
                    $groups[$groupKey]['contracts'][$identity] = [
                        'id' => $contract->id, 'name' => $contract->display_name, 'ends_on' => $end->toDateString(),
                        'days' => $days, 'key' => $key,
                        'url' => route('tenant.catalog.show', ['tenant' => $tenant->slug, 'catalog' => 'contracts', 'record' => $contract->id, 'year' => $contract->year]),
                    ];
                }
            }
        }
        ksort($groups);

        return array_values(array_map(function ($group) {
            $group['contracts'] = array_values($group['contracts']);

            return $group;
        }, $groups));
    }

    public function send(Tenant $tenant): int
    {
        $today = CarbonImmutable::now(self::TIMEZONE);
        if ($today->hour < self::HOUR) {
            return 0;
        }
        $count = 0;
        $failures = 0;
        foreach ($this->recipients($tenant, $this->settings($tenant)) as $recipient) {
            try {
                $group = DB::transaction(function () use ($tenant, $recipient, $today): ?array {
                    // Serialize reservation with other runs and settings updates.
                    $fresh = Tenant::query()->whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                    $groups = $this->calendar($fresh, $this->settings($fresh), $today->startOfDay(), $today->endOfDay());
                    $group = collect($groups)->firstWhere('recipient', $recipient);
                    if (! $group) {
                        return null;
                    }
                    foreach (array_unique([...array_column($group['contracts'], 'key'), $group['batch_key']]) as $key) {
                        DB::table('contract_reminder_deliveries')->updateOrInsert(
                            ['tenant_id' => $tenant->id, 'recipient' => $recipient, 'notification_key' => $key],
                            ['status' => 'pending', 'sent_at' => null],
                        );
                    }

                    return $group;
                });
                if (! $group) {
                    continue;
                }
                $delivery = DB::table('contract_reminder_deliveries')->where('tenant_id', $tenant->id)
                    ->where('recipient', $recipient)->whereIn('notification_key', [...array_column($group['contracts'], 'key'), $group['batch_key']]);
                $body = implode('; ', array_map(fn ($c) => $c['name'].' — scadenza '.CarbonImmutable::parse($c['ends_on'])->format('d/m/Y'), $group['contracts']));
                try {
                    Notification::route('mail', $recipient)->notify(new GeneralNotification(
                        $group['mode'] === 'monthly' ? 'Riepilogo scadenze contratti' : 'Promemoria scadenze contratti',
                        $body, 'Apri scadenzario', route('tenant.contract-schedule.index', $tenant->slug), $tenant->name,
                    ));
                } catch (\Throwable $exception) {
                    $delivery->update(['status' => 'failed']);
                    throw $exception;
                }
                // A process crash leaves a pending reservation: never blindly resend an ambiguous SMTP delivery.
                $delivery->update(['status' => 'sent', 'sent_at' => now()]);
                $count++;
            } catch (\Throwable $exception) {
                report($exception);
                $failures++;
            }
        }
        if ($failures > 0) {
            throw new \RuntimeException($failures.' invii falliti; gli invii riusciti restano registrati.');
        }

        return $count;
    }
}
