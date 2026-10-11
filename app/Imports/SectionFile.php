<?php

namespace App\Imports;

use Maatwebsite\Excel\Concerns\Import;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

class SectionFile implements Import, WithMultipleSheets
{
    public function __construct(public SectionRows $data) {}

    /** @return array<string, SectionRows> */
    public function sheets(): array
    {
        return ['Dati' => $this->data];
    }
}
