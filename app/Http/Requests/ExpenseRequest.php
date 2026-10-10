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
            'notes' => ['nullable', 'string', 'max:10000'],
            'cost_center_ids' => ['sometimes', 'array', 'list'],
            'cost_center_ids.*' => ['required', 'integer', 'distinct', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)],
            'lines' => ['sometimes', 'array', 'list', 'max:500'],
            'lines.*' => ['required', 'array:description,type,unit_price,quantity'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.type' => ['required', Rule::in(['allocated', 'actual'])],
            'lines.*.unit_price' => ['required', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
            'lines.*.quantity' => ['sometimes', 'required', 'numeric', 'gt:0', 'regex:/^\d{1,6}(\.\d{1,4})?$/'],
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
            'lines.*.description.required' => 'Inserisci la descrizione della riga.',
            'lines.*.type.in' => 'Seleziona allocato o effettivo.',
            'lines.*.unit_price.required' => 'Inserisci il prezzo unitario della riga.',
            'lines.*.quantity.regex' => 'Inserisci una quantità con massimo quattro decimali.',
            'lines.*.quantity.gt' => 'La quantità deve essere maggiore di zero.',
            'lines.max' => 'Una spesa può contenere al massimo 500 righe.',
            '*.exists' => 'Il collegamento selezionato non appartiene a questo ambiente.',
            '*.regex' => 'Inserisci un importo con al massimo due decimali (es. 1250.50).',
            'title.required' => 'Inserisci la descrizione della spesa.',
            'year.required' => 'Seleziona l’anno di imputazione.',
            'tenant_id.prohibited' => 'L’ambiente è determinato dal server.',
        ];
    }
}
