import type { ReactNode } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
export function FormSurface({
    title,
    description,
    children,
}: {
    title: ReactNode;
    description: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card className="min-w-0 gap-0 py-0">
            <CardHeader className="border-b p-5 sm:p-6">
                <CardTitle>
                    <h1 className="page-title">{title}</h1>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 p-0">{children}</CardContent>
        </Card>
    );
}
