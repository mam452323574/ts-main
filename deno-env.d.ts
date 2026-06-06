declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  // S-02 — DNS resolver utilise par webhookHostAllowlist pour rejeter les
  // URLs qui resolvent vers des IPs privees ou en boucle locale. Signature
  // minimale, suffisante pour les record types A / AAAA / CNAME que nous
  // interrogeons.
  resolveDns(
    query: string,
    recordType: 'A' | 'AAAA' | 'CNAME',
  ): Promise<string[]>;
};
