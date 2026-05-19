// Polyfill for Deno globals when editing in standard VS Code TS server
declare namespace Deno {
    export const env: {
        get(key: string): string | undefined;
        set(key: string, value: string): void;
    };
    export function serve(handler: (req: Request) => Response | Promise<Response>): void;
    export function test(
        name: string,
        fn: () => void | Promise<void>,
    ): void;
    // S-02 — DNS resolution utilisee par webhookHostAllowlist pour bloquer
    // les hostnames qui resolvent vers des IPs privees (defense SSRF).
    export function resolveDns(
        query: string,
        recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'PTR' | 'TXT',
        options?: { signal?: AbortSignal },
    ): Promise<string[]>;
}

// Mock for Google APIs
declare module "npm:googleapis*" {
    export const google: any;
}

// Mock for Resend API
declare module "npm:resend*" {
    export class Resend {
        constructor(key: string);
        emails: any;
    }
}

// Catch-all for HTTP imports
declare module "https://*" {
    const anyModule: any;
    export default anyModule;
}
