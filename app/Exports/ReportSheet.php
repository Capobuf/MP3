<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\Export;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;

class ReportSheet extends DefaultValueBinder implements Export, FromArray, WithColumnFormatting, WithCustomValueBinder, WithEvents, WithHeadings, WithStrictNullComparison, WithTitle
{
    /** @param list<string> $headers
     * @param  array<int, list<mixed>>  $rows
     * @param  array<string, string>  $formats
     */
    public function __construct(private string $name, private array $headers, private array $rows, private array $formats = []) {}

    public function title(): string
    {
        return $this->name;
    }

    /** @return list<string> */
    public function headings(): array
    {
        return $this->headers;
    }

    /** @return array<int, list<mixed>> */
    public function array(): array
    {
        return $this->rows;
    }

    /** @return array<string, string> */
    public function columnFormats(): array
    {
        return $this->formats;
    }

    public function bindValue(Cell $cell, mixed $value): bool
    {
        if (is_string($value)) {
            $cell->setValueExplicit($value, DataType::TYPE_STRING);

            return true;
        }

        return parent::bindValue($cell, $value);
    }

    /** @return array<class-string, callable> */
    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event): void {
            $sheet = $event->sheet->getDelegate();
            $last = Coordinate::stringFromColumnIndex(count($this->headers));
            $sheet->freezePane('A2');
            $sheet->setAutoFilter('A1:'.$last.max(1, count($this->rows) + 1));
            $sheet->getStyle('A1:'.$last.'1')->getFont()->setBold(true)->getColor()->setARGB('FFFFFFFF');
            $sheet->getStyle('A1:'.$last.'1')->getFill()->setFillType('solid')->getStartColor()->setARGB('FF334155');
            $sheet->getStyle('A1:'.$last.max(1, count($this->rows) + 1))->getAlignment()->setWrapText(true)->setVertical('top');
            foreach ($this->headers as $index => $header) {
                $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($index + 1))->setWidth(in_array($header, ['Note', 'Descrizione', 'Centri di costo', 'Percorso'], true) ? 45 : 24);
            }
            $sheet->getRowDimension(1)->setRowHeight(32);
        }];
    }
}
