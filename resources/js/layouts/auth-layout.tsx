import AuthLayoutTemplate from '@/layouts/auth/auth-split-layout';

export default function AuthLayout({
    title = '',
    description = '',
    logoOnly = false,
    showLogo = false,
    children,
}: {
    title?: string;
    description?: string;
    logoOnly?: boolean;
    showLogo?: boolean;
    children: React.ReactNode;
}) {
    return (
        <AuthLayoutTemplate
            title={title}
            description={description}
            logoOnly={logoOnly}
            showLogo={showLogo}
        >
            {children}
        </AuthLayoutTemplate>
    );
}
