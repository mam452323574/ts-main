const fs = require('fs');
const path = require('path');

const WORKFLOWS = [
  path.join(process.cwd(), 'n8n', 'workflows', 'coach.json'),
  path.join(process.cwd(), 'n8n', 'workflows', 'coach-conversation.json'),
];

function loadWorkflow(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isLlmNode(node) {
  return (
    typeof node?.type === 'string' &&
    node.type.startsWith('@n8n/n8n-nodes-langchain.lmChat')
  );
}

describe('Coach LLM node retry / timeout settings (N-B)', () => {
  for (const workflowPath of WORKFLOWS) {
    describe(path.basename(workflowPath), () => {
      const workflow = loadWorkflow(workflowPath);
      const llmNodes = workflow.nodes.filter(isLlmNode);

      it('has at least one LLM node (sanity check)', () => {
        expect(llmNodes.length).toBeGreaterThan(0);
      });

      it.each(llmNodes.map((node) => [node.name, node]))(
        'node "%s" has retryOnFail / maxTries / waitBetweenTries set',
        (_name, node) => {
          expect(node.retryOnFail).toBe(true);
          expect(node.maxTries).toBeGreaterThanOrEqual(2);
          expect(node.maxTries).toBeLessThanOrEqual(3);
          expect(typeof node.waitBetweenTries).toBe('number');
          expect(node.waitBetweenTries).toBeGreaterThanOrEqual(500);
        },
      );

      it.each(llmNodes.map((node) => [node.name, node]))(
        'node "%s" has a bounded request timeout (≤ 75 s)',
        (_name, node) => {
          const timeout = node?.parameters?.options?.requestTimeout;
          expect(typeof timeout).toBe('number');
          expect(timeout).toBeGreaterThan(0);
          // Edge function caller waits at most 75 s (cf.
          // COACH_CONVERSATION_WEBHOOK_TIMEOUT_MS); the LLM timeout must be
          // strictly smaller so the worker can fail fast and retry.
          expect(timeout).toBeLessThanOrEqual(75_000);
        },
      );
    });
  }
});
