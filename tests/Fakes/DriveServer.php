<?php

namespace Tests\Fakes;

use GuzzleHttp\Promise\FulfilledPromise;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Message\RequestInterface;

class DriveServer
{
    public array $files = [];

    public array $requests = [];

    public array $uploads = [];

    public bool $failUpload = false;

    public bool $failToken = false;

    public bool $loseUploadResponse = false;

    public bool $badChecksum = false;

    public string $account = 'account-1';

    private int $sequence = 0;

    public function __invoke(RequestInterface $request, array $options): FulfilledPromise
    {
        $path = $request->getUri()->getPath();
        $method = $request->getMethod();
        $body = (string) $request->getBody();
        $this->requests[] = [$method, $path, $body];
        $response = function (array $data, int $status = 200, array $headers = []): FulfilledPromise {
            return new FulfilledPromise(new Response($status, ['Content-Type' => 'application/json', ...$headers], json_encode($data)));
        };
        if (str_ends_with($path, '/token')) {
            return $this->failToken ? $response(['error' => 'invalid_grant'], 400)
                : $response(['access_token' => 'new-access-secret', 'refresh_token' => 'new-refresh-secret', 'expires_in' => 3600, 'created' => time()]);
        }
        if (str_ends_with($path, '/about')) {
            return $response(['user' => ['permissionId' => $this->account, 'emailAddress' => 'central@example.com']]);
        }
        if (str_ends_with($path, '/generateIds')) {
            return $response(['ids' => ['file-'.++$this->sequence]]);
        }
        if (preg_match('~/resumable/(file-\d+)$~', $path, $matches)) {
            $id = $matches[1];
            if ($this->failUpload) {
                return $response(['error' => ['message' => 'secret-token-never-display', 'code' => 403]], 403);
            }
            $this->files[$id]['content'] .= $body;
            preg_match('~bytes (\d+)-(\d+)/(\d+)~', $request->getHeaderLine('Content-Range'), $range);
            if ((int) $range[2] + 1 < (int) $range[3]) {
                return $response([], 308, ['Range' => 'bytes=0-'.$range[2]]);
            }
            if ($this->loseUploadResponse) {
                $this->loseUploadResponse = false;

                return $response(['error' => ['message' => 'Response lost', 'code' => 504]], 504);
            }

            return $response(['id' => $id, 'md5Checksum' => $this->badChecksum ? 'wrong' : md5($this->files[$id]['content'])]);
        }
        if (str_starts_with($path, '/upload/')) {
            $metadata = json_decode($body, true);
            $id = $metadata['id'] ?? basename($path);
            $this->uploads[] = [$method, $id];
            $this->files[$id] = [...($this->files[$id] ?? []), ...$metadata, 'content' => '', 'trashed' => false];

            return $response([], 200, ['Location' => 'https://www.googleapis.com/resumable/'.$id]);
        }
        if ($method === 'POST' && str_ends_with($path, '/files')) {
            $metadata = json_decode($body, true);
            $this->files[$metadata['id']] = [...$metadata, 'trashed' => false];

            return $response($metadata);
        }
        if ($method === 'GET' && preg_match('~/files/(file-\d+)$~', $path, $matches)) {
            return isset($this->files[$matches[1]]) ? $response(array_diff_key($this->files[$matches[1]], ['content' => true])) : $response(['error' => ['code' => 404, 'message' => 'Missing']], 404);
        }

        throw new \LogicException('Unexpected Google request: '.$method.' '.$path);
    }
}
