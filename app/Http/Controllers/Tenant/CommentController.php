<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\CommentRequest;
use App\Models\Contract;
use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        return [
            'id' => $comment->id,
            'content' => json_decode($comment->content, true, flags: JSON_THROW_ON_ERROR),
            'author' => ['id' => $comment->user_id, 'name' => $comment->user->name ?? 'Utente non disponibile'],
            'created_at' => $comment->created_at?->toISOString(),
            'updated_at' => $comment->updated_at?->toISOString(),
            'can_update' => $comment->user_id === $request->user()?->id,
            'can_delete' => $comment->user_id === $request->user()?->id,
        ];
    }

    public function index(Request $request, Tenant $tenant, string $resource, int $record): JsonResponse
    {
        $data = $request->validate(['direction' => ['sometimes', 'in:asc,desc'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $direction = $data['direction'] ?? 'desc';
        $comments = $this->owner($tenant, $resource, $record)->comments()
            ->with('user:id,name')->orderBy('created_at', $direction)->orderBy('id', $direction)->paginate(10);
        $comments->through(fn (Comment $comment) => $this->payload($comment, $request));

        return response()->json($comments);
    }

    public function store(CommentRequest $request, Tenant $tenant, string $resource, int $record): JsonResponse
    {
        $comment = DB::transaction(function () use ($request, $tenant, $resource, $record) {
            return $this->owner($tenant, $resource, $record, true)->comments()->create([
                'content' => json_encode($request->validated('content'), JSON_THROW_ON_ERROR),
                'user_id' => $request->user()?->id,
            ]);
        });

        return response()->json(['comment' => $this->payload($comment->load('user:id,name'), $request)], 201);
    }

    public function update(CommentRequest $request, Tenant $tenant, string $resource, int $record, int $comment): JsonResponse
    {
        $stored = DB::transaction(function () use ($request, $tenant, $resource, $record, $comment) {
            $stored = $this->owner($tenant, $resource, $record, true)->comments()->findOrFail($comment);
            abort_unless($stored->user_id === $request->user()?->id, 403);
            $stored->update(['content' => json_encode($request->validated('content'), JSON_THROW_ON_ERROR)]);

            return $stored;
        });

        return response()->json(['comment' => $this->payload($stored->load('user:id,name'), $request)]);
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
