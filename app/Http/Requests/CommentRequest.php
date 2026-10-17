<?php

namespace App\Http\Requests;

use App\Rules\CommentContent;
use Illuminate\Foundation\Http\FormRequest;

class CommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'content' => ['required', 'array', new CommentContent],
            'parent_id' => $this->isMethod('POST') ? ['sometimes', 'nullable', 'integer', 'min:1'] : ['prohibited'],
        ];
    }
}
