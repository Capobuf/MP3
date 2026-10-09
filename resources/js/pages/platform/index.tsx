import { Form, Head, Link } from '@inertiajs/react';
import {
    ArrowUpRight,
    Building2,
    ShieldCheck,
    Trash2,
    Users,
} from 'lucide-react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { Tenant, User } from '@/types';

type PlatformTenant = Tenant & {
    users: Pick<User, 'id' | 'name' | 'email'>[];
};

type PlatformUser = User & { tenants: Tenant[] };

export default function Platform({
    tenants,
    users,
}: {
    tenants: PlatformTenant[];
    users: PlatformUser[];
}) {
    const standardUsers = users.filter((user) => !user.is_super_admin);

    return (
        <>
            <Head title="Platform" />
            <div className="flex flex-1 flex-col gap-8 p-4 md:p-8">
                <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary p-2 text-primary-foreground">
                        <ShieldCheck className="size-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Platform administration
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Manage tenants, global users, and tenant access.
                        </p>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Create tenant</CardTitle>
                            <CardDescription>
                                The slug becomes the permanent tenant URL and is
                                not changed when the name is edited.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form
                                action="/platform/tenants"
                                method="post"
                                resetOnSuccess
                                className="grid gap-4"
                            >
                                {({ processing, errors }) => (
                                    <>
                                        <div className="grid gap-2">
                                            <Label htmlFor="tenant-name">
                                                Name
                                            </Label>
                                            <Input
                                                id="tenant-name"
                                                name="name"
                                                required
                                                placeholder="Acme S.r.l."
                                            />
                                            <InputError message={errors.name} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="tenant-slug">
                                                Slug
                                            </Label>
                                            <Input
                                                id="tenant-slug"
                                                name="slug"
                                                required
                                                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                                                placeholder="acme"
                                            />
                                            <InputError message={errors.slug} />
                                        </div>
                                        <Button disabled={processing}>
                                            {processing && <Spinner />}
                                            Create tenant
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Create standard user</CardTitle>
                            <CardDescription>
                                Set a temporary password securely, then share it
                                outside the application. The user can change or
                                reset it using Fortify.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form
                                action="/platform/users"
                                method="post"
                                resetOnSuccess
                                className="grid gap-4"
                            >
                                {({ processing, errors }) => (
                                    <>
                                        <div className="grid gap-2">
                                            <Label htmlFor="user-name">
                                                Name
                                            </Label>
                                            <Input
                                                id="user-name"
                                                name="name"
                                                required
                                            />
                                            <InputError message={errors.name} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="user-email">
                                                Email
                                            </Label>
                                            <Input
                                                id="user-email"
                                                name="email"
                                                type="email"
                                                required
                                            />
                                            <InputError
                                                message={errors.email}
                                            />
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div className="grid gap-2">
                                                <Label htmlFor="user-password">
                                                    Temporary password
                                                </Label>
                                                <PasswordInput
                                                    id="user-password"
                                                    name="password"
                                                    required
                                                    autoComplete="new-password"
                                                />
                                                <InputError
                                                    message={errors.password}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="user-password-confirmation">
                                                    Confirm password
                                                </Label>
                                                <PasswordInput
                                                    id="user-password-confirmation"
                                                    name="password_confirmation"
                                                    required
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                        </div>
                                        <Button disabled={processing}>
                                            {processing && <Spinner />}
                                            Create user
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Building2 className="size-5" />
                        <h2 className="text-xl font-semibold">Tenants</h2>
                        <Badge variant="secondary">{tenants.length}</Badge>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {tenants.map((tenant) => {
                            const assignedIds = new Set(
                                tenant.users.map((user) => user.id),
                            );
                            const availableUsers = standardUsers.filter(
                                (user) => !assignedIds.has(user.id),
                            );

                            return (
                                <Card key={tenant.id}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <CardTitle>
                                                    {tenant.name}
                                                </CardTitle>
                                                <CardDescription>
                                                    /t/{tenant.slug}
                                                </CardDescription>
                                            </div>
                                            <Button
                                                asChild
                                                size="sm"
                                                variant="outline"
                                            >
                                                <Link
                                                    href={`/t/${tenant.slug}/dashboard`}
                                                >
                                                    Open
                                                    <ArrowUpRight />
                                                </Link>
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-5">
                                        <Form
                                            action={`/platform/tenants/${tenant.id}`}
                                            method="patch"
                                            className="flex items-start gap-2"
                                        >
                                            {({ processing, errors }) => (
                                                <>
                                                    <div className="flex-1">
                                                        <Label
                                                            htmlFor={`tenant-${tenant.id}-name`}
                                                            className="sr-only"
                                                        >
                                                            Tenant name
                                                        </Label>
                                                        <Input
                                                            id={`tenant-${tenant.id}-name`}
                                                            name="name"
                                                            defaultValue={
                                                                tenant.name
                                                            }
                                                            required
                                                        />
                                                        <InputError
                                                            className="mt-1"
                                                            message={
                                                                errors.name
                                                            }
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        disabled={processing}
                                                    >
                                                        Save name
                                                    </Button>
                                                </>
                                            )}
                                        </Form>

                                        <div className="space-y-2">
                                            <Label>Assigned users</Label>
                                            {tenant.users.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">
                                                    No users assigned.
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {tenant.users.map(
                                                        (user) => (
                                                            <div
                                                                key={user.id}
                                                                className="flex items-center justify-between gap-3 rounded-md border p-3"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-medium">
                                                                        {
                                                                            user.name
                                                                        }
                                                                    </p>
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {
                                                                            user.email
                                                                        }
                                                                    </p>
                                                                </div>
                                                                <Form
                                                                    action={`/platform/tenants/${tenant.id}/users/${user.id}`}
                                                                    method="delete"
                                                                >
                                                                    {({
                                                                        processing,
                                                                    }) => (
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            disabled={
                                                                                processing
                                                                            }
                                                                            aria-label={`Remove ${user.name} from ${tenant.name}`}
                                                                        >
                                                                            <Trash2 />
                                                                        </Button>
                                                                    )}
                                                                </Form>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {availableUsers.length > 0 && (
                                            <Form
                                                action={`/platform/tenants/${tenant.id}/users`}
                                                method="post"
                                                className="flex items-start gap-2"
                                            >
                                                {({ processing, errors }) => (
                                                    <>
                                                        <div className="flex-1">
                                                            <Label
                                                                htmlFor={`tenant-${tenant.id}-user`}
                                                                className="sr-only"
                                                            >
                                                                User
                                                            </Label>
                                                            <select
                                                                id={`tenant-${tenant.id}-user`}
                                                                name="user_id"
                                                                required
                                                                defaultValue=""
                                                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                                                            >
                                                                <option
                                                                    value=""
                                                                    disabled
                                                                >
                                                                    Select user
                                                                </option>
                                                                {availableUsers.map(
                                                                    (user) => (
                                                                        <option
                                                                            key={
                                                                                user.id
                                                                            }
                                                                            value={
                                                                                user.id
                                                                            }
                                                                        >
                                                                            {
                                                                                user.name
                                                                            }{' '}
                                                                            (
                                                                            {
                                                                                user.email
                                                                            }
                                                                            )
                                                                        </option>
                                                                    ),
                                                                )}
                                                            </select>
                                                            <InputError
                                                                className="mt-1"
                                                                message={
                                                                    errors.user_id
                                                                }
                                                            />
                                                        </div>
                                                        <Button
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            Grant access
                                                        </Button>
                                                    </>
                                                )}
                                            </Form>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Users className="size-5" />
                        <h2 className="text-xl font-semibold">Global users</h2>
                        <Badge variant="secondary">{users.length}</Badge>
                    </div>
                    <Card>
                        <CardContent className="divide-y p-0">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">
                                                {user.name}
                                            </p>
                                            {user.is_super_admin && (
                                                <Badge>Superuser</Badge>
                                            )}
                                            {!user.email_verified_at && (
                                                <Badge variant="outline">
                                                    Email unverified
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {user.is_super_admin ? (
                                            <span className="text-sm text-muted-foreground">
                                                Access to every tenant
                                            </span>
                                        ) : user.tenants.length > 0 ? (
                                            user.tenants.map((tenant) => (
                                                <Badge
                                                    key={tenant.id}
                                                    variant="secondary"
                                                >
                                                    {tenant.name}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-sm text-muted-foreground">
                                                No tenant access
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>
            </div>
        </>
    );
}

Platform.layout = {
    breadcrumbs: [{ title: 'Platform', href: '/platform' }],
};
