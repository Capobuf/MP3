<?php

return [
    'max_size_kb' => (int) env('ATTACHMENTS_MAX_SIZE_KB', 20 * 1024),
    'max_files_per_selection' => 10,
    'extensions' => ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'csv', 'txt'],
    'preview_mime_types' => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
];
