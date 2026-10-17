import StarterKit from '@tiptap/starter-kit';

export const commentExtensions = [
    StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        strike: false,
        trailingNode: false,
        link: {
            openOnClick: false,
            protocols: ['http', 'https'],
            isAllowedUri: (url) => isCommentUrl(url),
            HTMLAttributes: {
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
            },
        },
    }),
];

export function isCommentUrl(value: string): boolean {
    if (!/^https?:\/\//i.test(value) || /[\s\\\p{C}]/u.test(value))
        return false;
    try {
        const url = new URL(value);
        return (
            !!url.hostname &&
            !url.username &&
            !url.password &&
            value.length <= 2048
        );
    } catch {
        return false;
    }
}

export const emptyComment = { type: 'doc', content: [{ type: 'paragraph' }] };
