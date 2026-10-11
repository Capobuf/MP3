<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\Export;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

class SectionWorkbook implements Export, WithMultipleSheets
{
    /** @param list<ReportSheet> $reports */
    public function __construct(private array $reports) {}

    /** @return list<ReportSheet> */
    public function sheets(): array
    {
        return $this->reports;
    }
}
