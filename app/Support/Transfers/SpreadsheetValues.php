<?php

namespace App\Support\Transfers;

use App\Support\Money;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Shared\Date;

final class SpreadsheetValues
{
    public static function money(mixed $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value) || is_float($value)) {
            if (! is_finite((float) $value) || abs((float) $value) > 999999999999.99 || abs($value * 100 - round($value * 100)) > max(0.0000001, abs($value * 100) * PHP_FLOAT_EPSILON)) {
                self::invalid($field, 'Importo fuori intervallo o con più di due decimali.');
            }

            return Money::decimal((int) round($value * 100));
        }
        $value = trim((string) $value);
        if (preg_match('/^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/D', $value)) {
            $value = str_replace('.', '', $value);
        }
        $value = str_replace(',', '.', $value);
        if (! preg_match('/^-?\d{1,12}(?:\.\d{1,2})?$/D', $value)) {
            self::invalid($field, 'Importo non valido o ambiguo. Usa 1234,56 oppure una cella numerica.');
        }

        return Money::decimal(Money::cents($value));
    }

    public static function date(mixed $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value) || is_float($value)) {
            if ($value < 1 || $value > 2958465 || floor($value) !== (float) $value || (Date::getExcelCalendar() === Date::CALENDAR_WINDOWS_1900 && (int) $value === 60)) {
                self::invalid($field, 'Data Excel non valida.');
            }

            return Date::excelToDateTimeObject($value)->format('Y-m-d');
        }
        foreach (['Y-m-d', 'd/m/Y'] as $format) {
            $date = \DateTimeImmutable::createFromFormat('!'.$format, (string) $value);
            if ($date && $date->format($format) === $value) {
                return $date->format('Y-m-d');
            }
        }
        self::invalid($field, 'Data non valida. Usa gg/mm/aaaa o aaaa-mm-gg.');
    }

    public static function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
