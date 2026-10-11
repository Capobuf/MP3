<?php

namespace App\Imports;

use App\Services\SectionSpreadsheet;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Concerns\Import;
use Maatwebsite\Excel\Concerns\OnEachRow;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithLimit;
use Maatwebsite\Excel\Events\BeforeSheet;
use Maatwebsite\Excel\Row;
use PhpOffice\PhpSpreadsheet\Cell\DataType;

class SectionRows implements Import, OnEachRow, WithEvents, WithHeadingRow, WithLimit
{
    /** @var list<array{row: int, values: array<string, mixed>, formulas: list<string>}> */
    public array $rows = [];

    public function __construct(private string $resource) {}

    public function limit(): int
    {
        return (int) config('transfers.xlsx_max_rows') + 1;
    }

    /** @return array<class-string, callable> */
    public function registerEvents(): array
    {
        return [BeforeSheet::class => function (BeforeSheet $event): void {
            $sheet = $event->sheet->getDelegate();
            $headers = $sheet->rangeToArray('A1:'.$sheet->getHighestDataColumn().'1', null, false, false)[0];
            if ($headers !== array_keys(SectionSpreadsheet::columns($this->resource))) {
                throw ValidationException::withMessages(['file' => 'Le intestazioni del foglio Dati non corrispondono al modello della sezione.']);
            }
        }];
    }

    public function onRow(Row $row): void
    {
        $values = $row->toArray(null, false, false);
        if (array_filter($values, fn ($value) => $value !== null && $value !== '') === []) {
            return;
        }
        $mapped = [];
        $formulas = [];
        foreach (SectionSpreadsheet::columns($this->resource) as $heading => $field) {
            $mapped[$field] = $values[Str::slug($heading, '_')] ?? null;
        }
        foreach ($row->getDelegate()->getCellIterator() as $cell) {
            if ($cell->getDataType() === DataType::TYPE_FORMULA) {
                $formulas[] = $cell->getColumn();
            }
        }
        $this->rows[] = ['row' => $row->getIndex(), 'values' => $mapped, 'formulas' => $formulas];
    }
}
