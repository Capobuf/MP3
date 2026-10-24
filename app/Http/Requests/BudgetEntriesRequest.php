<?php

namespace App\Http\Requests;

use App\Models\Tenant;
use App\Services\AnnualBudget;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BudgetEntriesRequest extends FormRequest
{
    public function authorize(): bool
    {
        $tenant = $this->route('tenant');

        return $tenant instanceof Tenant && $this->user()?->can('view', $tenant) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        /** @var Tenant $tenant */
        $tenant = $this->route('tenant');
        $rules = [
            'tenant_id' => ['prohibited'],
            'entries' => ['required', 'array', 'list', 'min:1'],
            'entries.*' => ['required', 'array:type,source_id,cost_center_id,restore'],
            'entries.*.type' => ['required', Rule::in(AnnualBudget::TYPES)],
            'entries.*.source_id' => ['required', 'integer'],
            'entries.*.cost_center_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)],
            'entries.*.restore' => ['sometimes', 'boolean'],
        ];

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['*.exists' => 'Il collegamento non appartiene a questa azienda.', '*.regex' => 'Inserisci un importo con massimo due decimali.'];
    }
}
