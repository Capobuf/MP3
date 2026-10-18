<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Notifications\GeneralNotification;
use App\Services\ContractSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Testing\Fakes\NotificationFake;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ContractScheduleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $user;

    private ContractSchedule $schedule;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-01 07:00', ContractSchedule::TIMEZONE));
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->user = User::factory()->create(['email' => 'member@example.test']);
        $this->tenant->users()->attach($this->user);
        $this->actingAs($this->user);
        $this->schedule = app(ContractSchedule::class);
        Notification::fake();
    }

    private function settings(array $overrides = []): array
    {
        return [...ContractSchedule::DEFAULTS, 'enabled' => true, 'days' => [7], 'user_ids' => [$this->user->id], ...$overrides];
    }

    private function save(array $settings): void
    {
        $this->tenant->contract_reminders = $settings;
        $this->tenant->save();
    }

    private function contract(array $attributes = [])
    {
        return $this->tenant->contracts()->create(['name' => 'Assistenza', 'year' => 2026, 'starts_on' => '2026-01-01', 'ends_on' => '2026-11-08', ...$attributes]);
    }

    public function test_listing_and_dashboard_timeline_include_multiyear_and_legacy_contracts(): void
    {
        foreach ([2026, 2027, 2028] as $endYear) {
            $this->contract(['ends_on' => $endYear.'-11-08']);
        }
        $this->contract(['year' => null, 'ends_on' => null]);
        $this->contract(['year' => 2027]);
        $this->get('/t/alfa/scadenzario?year=2026')->assertInertia(fn (Assert $p) => $p->component('tenants/contract-schedule')->has('records', 4)->where('year', 2026));
        $this->get('/t/alfa/scadenzario?year=2027')->assertInertia(fn (Assert $p) => $p->has('records', 2));
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $p) => $p->has('analytics.expiry.records', 4)->where('analytics.expiry.records.2.ends_on', '2028-11-08')->where('analytics.expiry.records.3.ends_on', null));
        $this->get('/t/alfa/scadenzario?year=2026&period=undated')->assertInertia(fn (Assert $p) => $p->has('records', 1));
        $this->get('/t/alfa/scadenzario?year=2026&period=30')->assertInertia(fn (Assert $p) => $p->has('records', 1));
        $this->get('/t/alfa/scadenzario?year=2026&search=missing')->assertInertia(fn (Assert $p) => $p->has('records', 0));
    }

    public function test_eligibility_annual_copies_and_early_reminders_across_new_year(): void
    {
        $source = $this->contract(['ends_on' => '2027-01-15']);
        $this->contract(['year' => null]);
        $this->contract(['ends_on' => null]);
        $this->contract(['ends_on' => '2026-10-01']);
        $other = Tenant::create(['name' => 'Other', 'slug' => 'other']);
        $other->contracts()->create(['name' => 'Private', 'year' => 2026, 'ends_on' => '2026-11-08']);
        $settings = $this->settings(['days' => [30]]);
        $this->assertSame([], $this->schedule->preview($this->tenant, $settings)['notifications']);
        $copy = $this->contract(['year' => 2027, 'ends_on' => '2027-01-15', 'source_contract_id' => $source->id]);
        $this->contract(['year' => 2027, 'ends_on' => '2027-01-15', 'source_contract_id' => $copy->id]);
        $preview = $this->schedule->preview($this->tenant, $settings)['notifications'];
        $this->assertCount(1, $preview);
        $this->assertSame('2026-12-16', $preview[0]['date']);
        $this->assertCount(1, $preview[0]['contracts']);
    }

    public function test_preview_matches_grouped_sends_and_deduplicates_addresses_not_independent_contracts(): void
    {
        $this->contract();
        $this->contract();
        $settings = $this->settings(['days' => [3, 7, 14], 'external_emails' => ['MEMBER@example.test', 'external@example.test']]);
        $this->save($settings);
        $preview = $this->schedule->preview($this->tenant, $settings);
        $this->assertCount(4, $preview['notifications']);
        $this->assertSame('2026-11-01', $preview['notifications'][0]['date']);
        $this->assertCount(2, $preview['notifications'][0]['contracts']);
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(2, $this->schedule->send($this->tenant));
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 2);
        Notification::assertSentOnDemand(GeneralNotification::class, fn ($n, $channels, $recipient) => $n->organizationName === 'Alfa' && is_string($recipient->routes['mail']) && str_contains($n->body, '08/11/2026'));
        $this->contract(['name' => 'Aggiunto dopo invio']);
        $this->assertSame(0, $this->schedule->send($this->tenant));
        $this->assertDatabaseCount('contract_reminder_deliveries', 6);
        $remaining = $this->schedule->preview($this->tenant, $settings)['notifications'];
        $this->assertCount(2, $remaining);
        $this->assertSame('2026-11-05', $remaining[0]['date']);
    }

    public function test_monthly_windows_are_contiguous_and_changing_day_does_not_repeat_month(): void
    {
        $this->travelTo(CarbonImmutable::parse('2027-01-28 07:00', ContractSchedule::TIMEZONE));
        foreach (['2027-01-28', '2027-02-27', '2027-02-28', '2027-03-27', '2027-03-28'] as $date) {
            $this->contract(['year' => 2027, 'ends_on' => $date]);
        }
        $settings = $this->settings(['mode' => 'monthly', 'monthly_day' => 28]);
        $this->save($settings);
        $groups = $this->schedule->preview($this->tenant, $settings)['notifications'];
        $this->assertSame(['2027-01-28', '2027-02-28', '2027-03-28'], array_column($groups, 'date'));
        $this->assertSame(['2027-02-27', '2027-03-27', '2027-04-27'], array_column($groups, 'window_end'));
        $this->assertCount(2, $groups[0]['contracts']);
        $this->assertCount(2, $groups[1]['contracts']);
        $this->travelTo(CarbonImmutable::parse('2027-01-28 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(1, $this->schedule->send($this->tenant));
        $this->assertSame(0, $this->schedule->send($this->tenant));
        $changed = [...$settings, 'monthly_day' => 1];
        $this->save($changed);
        $this->assertSame('2027-02-01', $this->schedule->preview($this->tenant, $changed)['notifications'][0]['date']);
        $this->assertDatabaseCount('contract_reminder_deliveries', 1);
    }

    public function test_monthly_day_change_later_in_same_month_and_disabled_then_enabled_keep_deduplication(): void
    {
        $this->contract(['ends_on' => '2026-11-20']);
        $settings = $this->settings(['mode' => 'monthly']);
        $this->save($settings);
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(1, $this->schedule->send($this->tenant));
        $this->save([...$settings, 'enabled' => false]);
        $this->assertSame(0, $this->schedule->send($this->tenant));
        $this->save([...$settings, 'monthly_day' => 15]);
        $this->travelTo(CarbonImmutable::parse('2026-11-15 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(0, $this->schedule->send($this->tenant));
    }

    public function test_preview_is_read_only_uses_unsaved_form_and_validates_addresses_and_membership(): void
    {
        $this->contract();
        $path = '/t/alfa/settings/contract-reminders';
        $this->postJson($path.'/preview', $this->settings())->assertOk()->assertJsonCount(1, 'notifications');
        $this->postJson($path.'/preview', $this->settings(['days' => [3]]))->assertOk()->assertJsonPath('notifications.0.date', '2026-11-05');
        $this->assertNull($this->tenant->fresh()->contract_reminders);
        $this->assertDatabaseCount('contract_reminder_deliveries', 0);
        Notification::assertNothingSent();
        $this->putJson($path, $this->settings(['external_emails' => ['invalid']]))->assertUnprocessable();
        $this->putJson($path, $this->settings(['user_ids' => []]))->assertUnprocessable();
        $this->putJson($path, $this->settings(['days' => []]))->assertUnprocessable();
        $outsider = User::factory()->create();
        $this->putJson($path, $this->settings(['user_ids' => [$outsider->id]]))->assertUnprocessable();
        $this->putJson($path, $this->settings(['enabled' => '1', 'days' => ['7'], 'monthly_day' => '1', 'user_ids' => [(string) $this->user->id]]))->assertOk();
        $this->assertTrue($this->tenant->fresh()->contract_reminders['enabled']);
        $this->assertSame([7], $this->tenant->fresh()->contract_reminders['days']);
        $this->postJson($path.'/preview', $this->settings(['enabled' => false]))->assertJsonPath('enabled', false)->assertJsonCount(0, 'notifications');
        $this->postJson($path.'/preview', $this->settings(['user_ids' => []]))->assertJsonCount(0, 'recipients');
        $this->actingAs($outsider)->get('/t/alfa/scadenzario')->assertForbidden();
        $this->get($path)->assertForbidden();
        $this->postJson($path.'/preview', $this->settings())->assertForbidden();
        $this->putJson($path, $this->settings())->assertForbidden();
    }

    public function test_removal_from_tenant_stops_delivery_and_date_changes_recompute_future_notices(): void
    {
        $contract = $this->contract();
        $settings = $this->settings();
        $this->save($settings);
        $contract->update(['ends_on' => '2026-11-12']);
        $this->assertSame('2026-11-05', $this->schedule->preview($this->tenant, $settings)['notifications'][0]['date']);
        $this->tenant->users()->detach($this->user);
        $this->assertSame([], $this->schedule->preview($this->tenant, $settings)['notifications']);
        $this->travelTo(CarbonImmutable::parse('2026-11-05 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(0, $this->schedule->send($this->tenant));
    }

    public function test_late_activation_never_catches_up_and_scheduler_does_not_change_session_year(): void
    {
        $this->contract();
        $this->travelTo(CarbonImmutable::parse('2026-11-01 09:00', ContractSchedule::TIMEZONE));
        $this->withSession(['economic_year.'.$this->tenant->id => 2030])->putJson('/t/alfa/settings/contract-reminders', $this->settings())->assertOk()->assertSessionHas('economic_year.'.$this->tenant->id, 2030);
        $this->assertSame(0, $this->schedule->send($this->tenant->fresh()));
        $this->assertSame([], $this->schedule->preview($this->tenant->fresh(), $this->settings())['notifications']);
        Notification::assertNothingSent();
    }

    public function test_failure_retries_only_failed_recipient_and_pending_crash_is_not_resent(): void
    {
        $this->contract();
        $this->save($this->settings(['external_emails' => ['z-failure@example.test']]));
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $fake = new class extends NotificationFake
        {
            public function send($notifiables, $notification): void
            {
                if ($notifiables->routes['mail'] === 'z-failure@example.test') {
                    throw new \RuntimeException('SMTP unavailable');
                }
                parent::send($notifiables, $notification);
            }
        };
        Notification::swap($fake);
        try {
            $this->schedule->send($this->tenant);
            $this->fail('Expected SMTP failure');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('invii falliti', $e->getMessage());
        }
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 1);
        $this->assertDatabaseHas('contract_reminder_deliveries', ['recipient' => 'member@example.test', 'status' => 'sent']);
        $this->assertDatabaseHas('contract_reminder_deliveries', ['recipient' => 'z-failure@example.test', 'status' => 'failed', 'sent_at' => null]);
        $this->postJson('/t/alfa/settings/contract-reminders/preview', $this->settings(['external_emails' => ['z-failure@example.test']]))->assertOk()->assertJsonCount(1, 'notifications');
        Notification::fake();
        $this->assertSame(1, $this->schedule->send($this->tenant));
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 1);
        DB::table('contract_reminder_deliveries')->update(['status' => 'pending', 'sent_at' => null]);
        $this->assertSame(0, $this->schedule->send($this->tenant));
        $this->assertSame(4, $this->schedule->preview($this->tenant, $this->settings())['pending']);
    }

    public function test_command_scans_enabled_tenants_independently_of_browser_year(): void
    {
        $this->contract();
        $this->save($this->settings());
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $other->contracts()->create(['name' => 'Beta contract', 'year' => 2026, 'ends_on' => '2026-11-08']);
        $other->contract_reminders = $this->settings(['user_ids' => [], 'external_emails' => ['beta@example.test']]);
        $other->save();
        $this->withSession(['economic_year.'.$this->tenant->id => 2030]);
        config(['mail.default' => 'smtp']);
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $this->artisan('contracts:remind')->assertSuccessful();
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 2);
        $this->artisan('contracts:remind')->assertSuccessful();
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 2);
        $this->assertSame(2030, session('economic_year.'.$this->tenant->id));
    }

    public function test_an_overlapping_run_sees_persistent_reservations_before_smtp_finishes(): void
    {
        $this->contract();
        $this->save($this->settings());
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $schedule = $this->schedule;
        $tenant = $this->tenant;
        $fake = new class($schedule, $tenant) extends NotificationFake
        {
            public int $overlappingCount = -1;

            public function __construct(private ContractSchedule $schedule, private Tenant $tenant) {}

            public function send($notifiables, $notification): void
            {
                $this->overlappingCount = $this->schedule->send($this->tenant);
                parent::send($notifiables, $notification);
            }
        };
        Notification::swap($fake);
        $this->assertSame(1, $schedule->send($tenant));
        $this->assertSame(0, $fake->overlappingCount);
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 1);
    }

    public function test_custom_days_can_be_combined_with_suggestions_previewed_saved_and_sent(): void
    {
        $this->contract(['ends_on' => '2026-12-16']);
        $path = '/t/alfa/settings/contract-reminders';
        $settings = $this->settings(['days' => [1, 3, 7, 14, 30, 45, 60]]);
        $this->postJson($path.'/preview', $settings)->assertOk()
            ->assertJsonCount(6, 'notifications')->assertJsonPath('notifications.0.date', '2026-11-01')
            ->assertJsonPath('notifications.0.contracts.0.days', 45);
        $this->putJson($path, $settings)->assertOk();
        $this->assertSame($settings['days'], $this->tenant->fresh()->contract_reminders['days']);
        foreach ([[0], [-1], [1.5], [3651], [45, 45], ['abc']] as $days) {
            $this->putJson($path, $this->settings(['days' => $days]))->assertUnprocessable();
            $this->postJson($path.'/preview', $this->settings(['days' => $days]))->assertUnprocessable();
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00', ContractSchedule::TIMEZONE));
        $this->assertSame(1, $this->schedule->send($this->tenant->fresh()));
        Notification::assertSentOnDemandTimes(GeneralNotification::class, 1);
        $this->assertSame(0, $this->schedule->send($this->tenant->fresh()));
    }

    public function test_email_template_accepts_external_recipients_and_command_rejects_non_smtp(): void
    {
        $notification = new GeneralNotification('Scadenze', 'Contratto — 08/11/2026', 'Apri', 'https://example.test/t/alfa/scadenzario', 'Alfa');
        $this->assertSame(['mail'], $notification->via(new AnonymousNotifiable));
        $this->assertStringContainsString('Alfa', $notification->toMail(new AnonymousNotifiable)->render());
        $this->artisan('contracts:remind')->assertSuccessful();
        $this->save($this->settings());
        $this->artisan('contracts:remind')->assertFailed();
        $this->assertDatabaseCount('contract_reminder_deliveries', 0);
    }
}
