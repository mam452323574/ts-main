import { runCoachSendMessageHandler } from './handler.ts';

Deno.serve((req) => runCoachSendMessageHandler(req));
