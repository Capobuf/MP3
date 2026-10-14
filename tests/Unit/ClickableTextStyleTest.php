<?php

namespace Tests\Unit;

use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

class ClickableTextStyleTest extends TestCase
{
    public function test_interface_sources_do_not_introduce_underlining(): void
    {
        $root = dirname(__DIR__, 2);
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root.'/resources', FilesystemIterator::SKIP_DOTS),
        );
        $violations = [];

        foreach ($files as $file) {
            if (! $file->isFile() || ! in_array($file->getExtension(), ['css', 'js', 'jsx', 'ts', 'tsx', 'php', 'html', 'svg'], true)) {
                continue;
            }

            foreach (file($file->getPathname()) as $index => $line) {
                // Covers utilities (including hover/focus), CSS and inline styles.
                if (preg_match('/(?<![\w-])underline(?![\w-])/', $line)) {
                    $violations[] = substr($file->getPathname(), strlen($root) + 1).':'.($index + 1);
                }
            }
        }

        $this->assertSame([], $violations, "Non introdurre sottolineature nell'interfaccia:\n".implode("\n", $violations));
    }
}
