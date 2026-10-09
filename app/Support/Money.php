<?php

namespace App\Support;

final class Money
{
    public static function cents(string $amount): int
    {
        $negative = str_starts_with($amount, '-');
        $parts = explode('.', ltrim($amount, '-'));
        $cents = (int) $parts[0] * 100 + (int) str_pad($parts[1] ?? '', 2, '0');

        return $negative ? -$cents : $cents;
    }

    public static function decimal(int $cents): string
    {
        return ($cents < 0 ? '-' : '').intdiv(abs($cents), 100).'.'.str_pad((string) (abs($cents) % 100), 2, '0', STR_PAD_LEFT);
    }
}
