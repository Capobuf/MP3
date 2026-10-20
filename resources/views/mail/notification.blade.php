@extends('mail.layouts.obake', ['preheader' => $title])

@section('content')
<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:25px;font-weight:400;color:#62656b;margin:0 0 0px;">{{ $body }}</p>
@if (filled($organizationName ?? null))
    @include('mail.partials.spacer', ['height' => 24])
    @include('mail.partials.organization')
@endif
@if (filled($actionText ?? null) && filled($actionUrl ?? null))
    @include('mail.partials.spacer', ['height' => 27])
    @include('mail.partials.action')
@endif
@endsection
