<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RyanChandler\Comments\Models\Comment;
use Tests\TestCase;

class CommentTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $author;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->author = User::factory()->create();
        $this->author->tenants()->attach($this->tenant);
    }

    private function content(string $text = 'Commento'): array
    {
        return ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];
    }

    private function records(Tenant $tenant): array
    {
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);

        return [
            'expenses' => $tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]),
            'contracts' => $tenant->contracts()->create(['name' => 'Contratto', 'vendor_id' => $vendor->id]),
            'projects' => $tenant->projects()->create(['name' => 'Progetto']),
            'vendors' => $tenant->vendors()->create(['name' => 'Fornitore indipendente']),
            'cost-centers' => $tenant->costCenters()->create(['name' => 'Centro']),
        ];
    }

    public function test_all_record_types_support_crud_and_comments_remain_after_record_undo(): void
    {
        $this->actingAs($this->author);
        foreach ($this->records($this->tenant) as $resource => $record) {
            $this->freezeTime();
            $recordPath = '/t/alfa/'.$resource.'/'.$record->id;
            $path = $recordPath.'/comments';
            $response = $this->postJson($path, ['content' => $this->content(), 'user_id' => 999])
                ->assertCreated()->assertHeaderMissing('X-Undo-Action')
                ->assertJsonPath('comment.author.id', $this->author->id)
                ->assertJsonPath('comment.can_update', true)->assertJsonPath('comment.can_delete', true);
            $id = $response->json('comment.id');
            $created = $response->json('comment.created_at');
            $response->assertJsonPath('comment.updated_at', $created);
            $reply = $this->postJson($path, ['content' => $this->content('Risposta'), 'parent_id' => $id])->assertCreated()->assertHeaderMissing('X-Undo-Action')->json('comment.id');
            $this->assertNull(Comment::findOrFail($id)->parent_id);
            $this->assertSame($this->content(), json_decode(Comment::findOrFail($id)->content, true));
            $this->getJson($path.'?year=2030')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $id);
            $this->travel(2)->seconds();
            $updated = $this->patchJson($path.'/'.$id, ['content' => $this->content('Aggiornato')])
                ->assertOk()->assertHeaderMissing('X-Undo-Action')->assertJsonPath('comment.created_at', $created)->json('comment.updated_at');
            $this->assertNotSame($created, $updated);
            $deleted = $this->postJson($path, ['content' => $this->content('Da eliminare')])->assertCreated()->json('comment.id');
            $this->deleteJson($path.'/'.$deleted)->assertOk()->assertHeaderMissing('X-Undo-Action');
            $this->assertSoftDeleted('comments', ['id' => $deleted]);
            $this->getJson($path)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
            $this->patchJson($path.'/'.$deleted, ['content' => $this->content()])->assertNotFound();
            $this->deleteJson($recordPath, ['delete_children' => false])->assertOk()->assertHeader('X-Undo-Action');
            $this->getJson($path)->assertNotFound();
            $this->postJson($path, ['content' => $this->content()])->assertNotFound();
            $this->patchJson($path.'/'.$id, ['content' => $this->content()])->assertNotFound();
            $this->deleteJson($path.'/'.$id)->assertNotFound();
            $this->assertDatabaseHas('comments', ['id' => $id, 'deleted_at' => null]);
            $this->postJson('/t/alfa/undo')->assertOk();
            $this->getJson($path)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.content', $this->content('Aggiornato'))->assertJsonPath('data.0.replies.0.id', $reply)->assertJsonPath('comments_count', 2);
            $this->travelBack();
        }
    }

    public function test_authorization_and_record_scoping_for_every_resource(): void
    {
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $foreignRecords = $this->records($other);
        foreach ($this->records($this->tenant) as $resource => $record) {
            $path = '/t/alfa/'.$resource.'/'.$record->id.'/comments';
            $foreign = '/t/alfa/'.$resource.'/'.$foreignRecords[$resource]->id.'/comments';
            $this->getJson($path)->assertUnauthorized();
            $this->postJson($path, ['content' => $this->content()])->assertUnauthorized();
            $this->actingAs($this->author);
            $id = $this->postJson($path, ['content' => $this->content()])->assertCreated()->json('comment.id');
            $this->getJson($foreign)->assertNotFound();
            $this->postJson($foreign, ['content' => $this->content()])->assertNotFound();
            $this->patchJson($foreign.'/'.$id, ['content' => $this->content()])->assertNotFound();
            $this->deleteJson($foreign.'/'.$id)->assertNotFound();
            $second = $this->records($this->tenant)[$resource];
            $secondPath = '/t/alfa/'.$resource.'/'.$second->id.'/comments/'.$id;
            $this->patchJson($secondPath, ['content' => $this->content()])->assertNotFound();
            $this->deleteJson($secondPath)->assertNotFound();
            $member = User::factory()->create();
            $member->tenants()->attach($this->tenant);
            $this->actingAs($member);
            $this->getJson($path)->assertOk()->assertJsonPath('data.0.can_update', false)->assertJsonPath('data.0.can_delete', false);
            $this->patchJson($path.'/'.$id, ['content' => $this->content()])->assertForbidden();
            $this->deleteJson($path.'/'.$id)->assertForbidden();
            $this->postJson($path, ['content' => $this->content()])->assertCreated();
            $this->actingAs(User::factory()->create(['is_super_admin' => true]));
            $this->patchJson($path.'/'.$id, ['content' => $this->content()])->assertForbidden();
            $this->deleteJson($path.'/'.$id)->assertForbidden();
            $this->actingAs(User::factory()->create());
            $this->getJson($path)->assertForbidden();
            $this->postJson($path, ['content' => $this->content()])->assertForbidden();
            $this->patchJson($path.'/'.$id, ['content' => $this->content()])->assertForbidden();
            $this->deleteJson($path.'/'.$id)->assertForbidden();
            auth()->forgetGuards();
        }
        $this->actingAs($this->author);
        $this->getJson('/t/alfa/budget/1/comments')->assertNotFound();
    }

    public function test_pagination_uses_creation_time_and_stable_id_order_without_deleted_comments(): void
    {
        $this->actingAs($this->author);
        $record = $this->tenant->vendors()->create(['name' => 'Uno']);
        $path = '/t/alfa/vendors/'.$record->id.'/comments';
        $this->freezeTime();
        $ids = [];
        for ($i = 0; $i < 10; $i++) {
            $ids[] = $this->postJson($path, ['content' => $this->content((string) $i)])->assertCreated()->json('comment.id');
        }
        $this->getJson($path)->assertJsonPath('last_page', 1)->assertJsonCount(10, 'data');
        $ids[] = $this->postJson($path, ['content' => $this->content('Undicesimo')])->assertCreated()->json('comment.id');
        $this->getJson($path)->assertJsonPath('total', 11)->assertJsonPath('per_page', 10)->assertJsonPath('last_page', 2)->assertJsonPath('data.0.id', $ids[10])->assertJsonPath('data.9.id', $ids[1]);
        $this->getJson($path.'?page=2')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ids[0]);
        $this->getJson($path.'?direction=asc')->assertJsonPath('data.0.id', $ids[0])->assertJsonPath('data.9.id', $ids[9]);
        $this->getJson($path.'?page=2&direction=asc')->assertJsonPath('data.0.id', $ids[10]);
        $this->travel(2)->seconds();
        $this->patchJson($path.'/'.$ids[0], ['content' => $this->content('Modifica')])->assertOk();
        $this->getJson($path)->assertJsonPath('data.0.id', $ids[10]);
        $this->getJson($path.'?direction=asc')->assertJsonPath('data.0.id', $ids[0]);
        $this->deleteJson($path.'/'.$ids[0])->assertOk();
        $this->getJson($path.'?page=2')->assertJsonCount(0, 'data')->assertJsonPath('last_page', 1)->assertJsonPath('total', 10);
        $this->getJson($path)->assertJsonCount(10, 'data')->assertJsonPath('last_page', 1);
        foreach (['direction=invalid', 'page=0', 'page=1.5', 'direction=desc%3BDROP'] as $query) {
            $this->getJson($path.'?'.$query)->assertUnprocessable();
        }
        $this->travelBack();
    }

    public function test_replies_are_scoped_to_a_live_root_and_only_the_author_can_change_them(): void
    {
        $this->actingAs($this->author);
        $vendor = $this->tenant->vendors()->create(['name' => 'Uno']);
        $otherRecord = $this->tenant->vendors()->create(['name' => 'Due']);
        $foreignTenant = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $foreignRecord = $foreignTenant->vendors()->create(['name' => 'Esterno']);
        $path = '/t/alfa/vendors/'.$vendor->id.'/comments';
        $root = $this->postJson($path, ['content' => $this->content()])->assertCreated()->json('comment.id');
        $secondRoot = $this->postJson($path, ['content' => $this->content('Altro principale')])->assertCreated()->json('comment.id');
        $wrongRecord = $otherRecord->comments()->create(['content' => json_encode($this->content()), 'user_id' => $this->author->id]);
        $foreign = $foreignRecord->comments()->create(['content' => json_encode($this->content()), 'user_id' => $this->author->id]);
        foreach ([$wrongRecord->id, $foreign->id, 999999, -1] as $parent) {
            $this->postJson($path, ['content' => $this->content(), 'parent_id' => $parent])->assertUnprocessable()->assertJsonValidationErrors('parent_id');
        }
        $member = User::factory()->create();
        $member->tenants()->attach($this->tenant);
        $this->actingAs($member);
        $reply = $this->postJson($path, ['content' => $this->content('Risposta'), 'parent_id' => $root, 'user_id' => $this->author->id])->assertCreated()->assertJsonPath('comment.author.id', $member->id)->json('comment.id');
        $this->postJson($path, ['content' => $this->content(), 'parent_id' => $reply])->assertUnprocessable();
        $this->patchJson($path.'/'.$reply, ['content' => $this->content('Modificata'), 'parent_id' => $secondRoot])->assertUnprocessable();
        $this->patchJson($path.'/'.$reply, ['content' => $this->content('Modificata')])->assertOk()->assertJsonPath('comment.parent_id', $root);
        $this->actingAs($this->author);
        $this->patchJson($path.'/'.$reply, ['content' => $this->content()])->assertForbidden();
        $this->deleteJson($path.'/'.$reply)->assertForbidden();
        $this->deleteJson($path.'/'.$root)->assertOk();
        $this->postJson($path, ['content' => $this->content(), 'parent_id' => $root])->assertUnprocessable();
        $response = $this->getJson($path.'?direction=asc')->assertOk()->assertJsonPath('total', 2)->assertJsonPath('comments_count', 2)->assertJsonPath('data.0.id', $root)->assertJsonPath('data.0.deleted', true)->assertJsonPath('data.0.content', null)->assertJsonPath('data.0.author', null)->assertJsonPath('data.0.can_update', false)->assertJsonPath('data.0.replies.0.content', $this->content('Modificata'));
        $this->assertStringNotContainsString(json_encode($this->content()), json_encode($response->json('data.0')));
        $this->actingAs($member);
        $this->deleteJson($path.'/'.$reply)->assertOk();
        $this->getJson($path)->assertOk()->assertJsonPath('total', 1)->assertJsonPath('comments_count', 1)->assertJsonPath('data.0.id', $secondRoot);
    }

    public function test_only_roots_are_paginated_and_replies_are_loaded_in_chronological_order(): void
    {
        $this->actingAs($this->author);
        $vendor = $this->tenant->vendors()->create(['name' => 'Uno']);
        $path = '/t/alfa/vendors/'.$vendor->id.'/comments';
        $this->freezeTime();
        $ids = [];
        for ($i = 0; $i < 10; $i++) {
            $ids[] = $this->postJson($path, ['content' => $this->content('Principale '.$i)])->assertCreated()->json('comment.id');
        }
        $reply1 = $this->postJson($path, ['content' => $this->content('Prima risposta'), 'parent_id' => $ids[0]])->assertCreated()->json('comment.id');
        $reply2 = $this->postJson($path, ['content' => $this->content('Seconda risposta'), 'parent_id' => $ids[0]])->assertCreated()->json('comment.id');
        $this->getJson($path)->assertJsonPath('total', 10)->assertJsonPath('comments_count', 12)->assertJsonPath('last_page', 1)->assertJsonCount(10, 'data')->assertJsonPath('data.9.replies.0.id', $reply1)->assertJsonPath('data.9.replies.1.id', $reply2);
        $eleventh = $this->postJson($path, ['content' => $this->content('Undicesimo')])->assertCreated()->json('comment.id');
        $this->getJson($path)->assertJsonPath('total', 11)->assertJsonPath('comments_count', 13)->assertJsonPath('last_page', 2)->assertJsonPath('data.0.id', $eleventh);
        $this->getJson($path.'?page=2')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ids[0])->assertJsonCount(2, 'data.0.replies');
        $this->getJson($path.'?direction=asc')->assertJsonPath('data.0.id', $ids[0])->assertJsonPath('data.0.replies.0.id', $reply1)->assertJsonPath('data.0.replies.1.id', $reply2);
        DB::enableQueryLog();
        $this->getJson($path)->assertOk();
        $queries = collect(DB::getQueryLog())->filter(fn ($query) => str_contains($query['query'], 'from `comments`') || str_contains($query['query'], 'from "comments"'));
        $this->assertLessThanOrEqual(4, $queries->count());
        DB::disableQueryLog();
        $this->travelBack();
    }

    public function test_all_supported_formatting_round_trips_as_json(): void
    {
        $this->actingAs($this->author);
        $vendor = $this->tenant->vendors()->create(['name' => 'Uno']);
        $path = '/t/alfa/vendors/'.$vendor->id.'/comments';
        $content = ['type' => 'doc', 'content' => [
            ['type' => 'paragraph', 'content' => [
                ['type' => 'text', 'text' => 'Formattato', 'marks' => [['type' => 'bold'], ['type' => 'italic'], ['type' => 'underline']]],
                ['type' => 'hardBreak'],
                ['type' => 'text', 'text' => 'Sito', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'https://example.com/path?x=1&y=2', 'target' => '_blank', 'rel' => 'noopener noreferrer nofollow', 'class' => null, 'title' => null]]]],
            ]],
            ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [$this->content('Punto')['content'][0]]]]],
            ['type' => 'orderedList', 'attrs' => ['start' => 2, 'type' => null], 'content' => [['type' => 'listItem', 'content' => [$this->content('Numero')['content'][0]]]]],
        ]];
        $id = $this->postJson($path, ['content' => $content])->assertCreated()->assertJsonPath('comment.content', $content)->json('comment.id');
        $this->getJson($path)->assertJsonPath('data.0.content', $content);
        $this->patchJson($path.'/'.$id, ['content' => $this->content(str_repeat('è', 5000))])->assertOk();
    }

    public function test_invalid_or_excessive_rich_text_is_rejected_for_create_and_update(): void
    {
        $this->actingAs($this->author);
        $vendor = $this->tenant->vendors()->create(['name' => 'Uno']);
        $path = '/t/alfa/vendors/'.$vendor->id.'/comments';
        $id = $this->postJson($path, ['content' => $this->content()])->assertCreated()->json('comment.id');
        $invalid = [null, '<p>HTML</p>', [], ['type' => 'doc'], $this->content(''), $this->content(" \n\u{200B}\u{00A0}"), $this->content(str_repeat('è', 5001)), ['type' => 'doc', 'content' => [['type' => 'image', 'attrs' => ['src' => 'https://example.com/x.png']]]]];
        foreach (['heading', 'blockquote', 'codeBlock', 'iframe', 'script', 'html', 'table'] as $type) {
            $invalid[] = ['type' => 'doc', 'content' => [['type' => $type, 'content' => $this->content()['content']]]];
        }
        foreach (['strike', 'code', 'textStyle', 'script'] as $type) {
            $content = $this->content();
            $content['content'][0]['content'][0]['marks'] = [['type' => $type]];
            $invalid[] = $content;
        }
        foreach (['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', '//example.com', 'https://', 'https://example.com/ bad', "https://example.com/\n", 'https://user:pass@example.com', 'https://example.com\\@evil.com'] as $href) {
            $content = $this->content();
            $content['content'][0]['content'][0]['marks'] = [['type' => 'link', 'attrs' => ['href' => $href]]];
            $invalid[] = $content;
        }
        foreach ([['onclick' => 'alert(1)'], ['style' => 'color:red'], ['class' => 'evil'], ['target' => 'frame'], ['rel' => 'opener']] as $extra) {
            $content = $this->content();
            $content['content'][0]['content'][0]['marks'] = [['type' => 'link', 'attrs' => ['href' => 'https://example.com', ...$extra]]];
            $invalid[] = $content;
        }
        $content = $this->content();
        $content['content'][0]['attrs'] = ['onclick' => 'alert(1)'];
        $invalid[] = $content;
        $content = $this->content();
        $content['content'][0]['content'][0]['html'] = '<script>alert(1)</script>';
        $invalid[] = $content;
        $invalid[] = ['type' => 'doc', 'content' => array_fill(0, 1001, ['type' => 'paragraph'])];
        $deep = $this->content()['content'][0];
        for ($i = 0; $i < 20; $i++) {
            $deep = ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [$this->content()['content'][0], $deep]]]];
        }
        $invalid[] = ['type' => 'doc', 'content' => [$deep]];
        $invalid[] = ['type' => 'doc', 'content' => array_fill(0, 300, ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'a', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'https://example.com/'.str_repeat('a', 200)]]]]]])];
        foreach ($invalid as $content) {
            $response = $this->postJson($path, ['content' => $content]);
            $this->assertSame(422, $response->status(), json_encode($content));
            $response->assertJsonValidationErrors('content');
            $this->patchJson($path.'/'.$id, ['content' => $content])->assertUnprocessable()->assertJsonValidationErrors('content');
        }
        $this->assertDatabaseCount('comments', 1);
        $this->getJson($path)->assertJsonPath('data.0.content', $this->content());
    }
}
