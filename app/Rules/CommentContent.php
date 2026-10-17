<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class CommentContent implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $text = '';
        $nodes = 0;
        $json = json_encode($value);
        if ($json === false || strlen($json) > 65536 || ! $this->node($value, ['doc'], $text, $nodes)) {
            $fail('Il commento contiene formattazione non consentita o supera i limiti del documento.');

            return;
        }
        if (preg_replace('/[\s\p{Z}\p{C}]+/u', '', $text) === '') {
            $fail('Inserisci il testo del commento.');
        } elseif (mb_strlen($text) > 5000) {
            $fail('Il commento può contenere al massimo 5.000 caratteri di testo.');
        }
    }

    /** @param list<string> $allowed */
    private function node(mixed $node, array $allowed, string &$text, int &$nodes, int $depth = 0): bool
    {
        if (++$nodes > 1000 || $depth > 16 || ! is_array($node) || ! isset($node['type']) || ! in_array($node['type'], $allowed, true)) {
            return false;
        }
        $type = $node['type'];
        $keys = match ($type) {
            'text' => ['type', 'text', 'marks'],
            'orderedList' => ['type', 'content', 'attrs'],
            default => ['type', 'content'],
        };
        if (array_diff(array_keys($node), $keys) !== []) {
            return false;
        }
        if ($type === 'text') {
            if (! isset($node['text']) || ! is_string($node['text']) || $node['text'] === '' || ! $this->marks(array_key_exists('marks', $node) ? $node['marks'] : [])) {
                return false;
            }
            $text .= $node['text'];

            return true;
        }
        if ($type === 'hardBreak') {
            return ! array_key_exists('content', $node);
        }
        if (array_key_exists('attrs', $node)) {
            $attrs = $node['attrs'];
            if (! is_array($attrs) || array_diff(array_keys($attrs), ['start', 'type']) !== [] || (array_key_exists('start', $attrs) && (! is_int($attrs['start']) || $attrs['start'] < 1 || $attrs['start'] > 1000000)) || isset($attrs['type'])) {
                return false;
            }
        }
        $children = array_key_exists('content', $node) ? $node['content'] : [];
        if (! is_array($children) || ! array_is_list($children)) {
            return false;
        }
        $childTypes = match ($type) {
            'doc', 'listItem' => ['paragraph', 'bulletList', 'orderedList'],
            'paragraph' => ['text', 'hardBreak'],
            'bulletList', 'orderedList' => ['listItem'],
            default => [],
        };
        if ($type !== 'paragraph' && $children === []) {
            return false;
        }
        if ($type === 'listItem' && ($children[0]['type'] ?? null) !== 'paragraph') {
            return false;
        }
        foreach ($children as $child) {
            if (! $this->node($child, $childTypes, $text, $nodes, $depth + 1)) {
                return false;
            }
        }

        return true;
    }

    private function marks(mixed $marks): bool
    {
        if (! is_array($marks) || ! array_is_list($marks) || count($marks) > 4) {
            return false;
        }
        $seen = [];
        foreach ($marks as $mark) {
            if (! is_array($mark) || array_diff(array_keys($mark), ['type', 'attrs']) !== [] || ! isset($mark['type']) || ! in_array($mark['type'], ['bold', 'italic', 'underline', 'link'], true) || in_array($mark['type'], $seen, true)) {
                return false;
            }
            $seen[] = $mark['type'];
            if ($mark['type'] !== 'link') {
                if (array_key_exists('attrs', $mark)) {
                    return false;
                }

                continue;
            }
            $attrs = $mark['attrs'] ?? null;
            if (! is_array($attrs) || array_diff(array_keys($attrs), ['href', 'target', 'rel', 'class', 'title']) !== []) {
                return false;
            }
            $href = $attrs['href'] ?? null;
            if (! is_string($href) || strlen($href) > 2048 || ! preg_match('~^https?://~i', $href) || preg_match('/[\s\p{C}]/u', $href) || str_contains($href, '\\') || filter_var($href, FILTER_VALIDATE_URL) === false || parse_url($href, PHP_URL_USER) !== null || parse_url($href, PHP_URL_PASS) !== null) {
                return false;
            }
            if (! in_array($attrs['target'] ?? null, [null, '_blank', '_self'], true) || ! in_array($attrs['rel'] ?? null, [null, 'noopener noreferrer nofollow'], true) || isset($attrs['class']) || (isset($attrs['title']) && (! is_string($attrs['title']) || mb_strlen($attrs['title']) > 2048))) {
                return false;
            }
        }

        return true;
    }
}
