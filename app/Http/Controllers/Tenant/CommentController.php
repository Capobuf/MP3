<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\CommentRequest;
use App\Models\Contract;
use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RyanChandler\Comments\Models\Comment;

class CommentController extends Controller
{
    private function owner(Tenant $tenant, string $resource, int $record, bool $lock = false): Contract|CostCenter|Expense|Project|Vendor
    {
        $query = match ($resource) {
            'contracts' => $tenant->contracts(),
            'cost-centers' => $tenant->costCenters(),
            'expenses' => $tenant->expenses(),
            'projects' => $tenant->projects(),
            'vendors' => $tenant->vendors(),
            default => abort(404),
        };
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->findOrFail($record);
    }

    /** @return array<string, mixed> */
    private function payload(Comment $comment, Request $request): array
    {
        $deleted = $comment->trashed();

        return [
            'id' => $comment->id,
            'parent_id' => $comment->parent_id,
            'deleted' => $deleted,
            'content' => $deleted ? null : json_decode($comment->content, true, flags: JSON_THROW_ON_ERROR),
            'author' => $deleted ? null : ['id' => $comment->user_id, 'name' => $comment->user->name ?? 'Utente non disponibile', 'avatar' => $comment->user->avatar ?? null],
            'created_at' => $comment->created_at?->toISOString(),
            'updated_at' => $comment->updated_at?->toISOString(),
            'can_update' => ! $deleted && $comment->user_id === $request->user()?->id,
            'can_delete' => ! $deleted && $comment->user_id === $request->user()?->id,
        ];
    }

    public function index(Request $request, Tenant $tenant, string $resource, int $record): JsonResponse
    {
        $data = $request->validate(['direction' => ['sometimes', 'in:asc,desc'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $direction = $data['direction'] ?? 'desc';
        $owner = $this->owner($tenant, $resource, $record);
        $comments = $owner->comments()->withTrashed()->whereNull('parent_id')
            ->where(fn ($query) => $query->whereNull('deleted_at')->orWhereHas('children'))
            ->with(['user:id,name,avatar_path', 'children' => fn ($query) => $query->with('user:id,name,avatar_path')->orderBy('created_at')->orderBy('id')])
            ->orderBy('created_at', $direction)->orderBy('id', $direction)->paginate(10)->withQueryString();
        $comments->through(function (Comment $comment) use ($request): array {
            /** @var Collection<int, Comment> $replies */
            $replies = $comment->getRelation('children');

            return [
                ...$this->payload($comment, $request),
                'replies' => $replies->map(fn (Comment $reply) => $this->payload($reply, $request))->values(),
            ];
        });

        return response()->json([...$comments->toArray(), 'comments_count' => $owner->comments()->count()]);
    }

    public function store(CommentRequest $request, Tenant $tenant, string $resource, int $record): JsonResponse
    {
        $comment = DB::transaction(function () use ($request, $tenant, $resource, $record) {
            // Serialize new authorship with account deletion (comments have no user FK).
            User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $owner = $this->owner($tenant, $resource, $record, true);
            $parentId = $request->validated('parent_id');
            if ($parentId !== null && ! $owner->comments()->whereNull('parent_id')->whereKey($parentId)->exists()) {
                throw ValidationException::withMessages(['parent_id' => 'Il commento a cui rispondere non è disponibile per questo record.']);
            }

            return $owner->comments()->create([
                'parent_id' => $parentId,
                'content' => json_encode($request->validated('content'), JSON_THROW_ON_ERROR),
                'user_id' => $request->user()?->id,
            ]);
        });

        return response()->json(['comment' => $this->payload($comment->load('user:id,name,avatar_path'), $request)], 201);
    }

    public function update(CommentRequest $request, Tenant $tenant, string $resource, int $record, int $comment): JsonResponse
    {
        $stored = DB::transaction(function () use ($request, $tenant, $resource, $record, $comment) {
            $stored = $this->owner($tenant, $resource, $record, true)->comments()->findOrFail($comment);
            abort_unless($stored->user_id === $request->user()?->id, 403);
            $stored->update(['content' => json_encode($request->validated('content'), JSON_THROW_ON_ERROR)]);

            return $stored;
        });

        return response()->json(['comment' => $this->payload($stored->load('user:id,name,avatar_path'), $request)]);
    }

    public function destroy(Request $request, Tenant $tenant, string $resource, int $record, int $comment): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $resource, $record, $comment): void {
            $stored = $this->owner($tenant, $resource, $record, true)->comments()->findOrFail($comment);
            abort_unless($stored->user_id === $request->user()?->id, 403);
            $stored->delete();
        });

        return response()->json(['message' => 'Commento eliminato.']);
    }
}
