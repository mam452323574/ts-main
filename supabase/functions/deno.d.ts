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
