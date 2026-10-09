<?php

namespace App\Http\Requests;

use App\Models\Tenant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExpenseRequest extends FormRequest
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

        return self::forTenant($tenant, $this->isMethod('patch'));
    }

    /** @return array<string, mixed> */
    public static function forTenant(Tenant $tenant, bool $partial = false): array
    {
        $required = $partial ? ['sometimes', 'required'] : ['required'];
        $rules = [
            'tenant_id' => ['prohibited'],
            'title' => [...$required, 'string', 'max:255'],
            'year' => [...$required, 'integer', 'between:2000,2100'],
            'allocated_amount' => ['nullable', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
            'actual_amount' => ['nullable', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
            'due_on' => ['nullable', 'date_format:Y-m-d'],
            'actual_on' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ];
        foreach (['vendor' => 'vendors', 'contract' => 'contracts', 'project' => 'projects'] as $field => $table) {
            $rules[$field.'_id'] = ['nullable', 'integer', Rule::exists($table, 'id')->where('tenant_id', $tenant->id)];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            '*.exists' => 'Il collegamento selezionato non appartiene a questo ambiente.',
            '*.regex' => 'Inserisci un importo con al massimo due decimali (es. 1250.50).',
            'title.required' => 'Inserisci la descrizione della spesa.',
            'year.required' => 'Seleziona l’anno di imputazione.',
            'tenant_id.prohibited' => 'L’ambiente è determinato dal server.',
        ];
    }
}
