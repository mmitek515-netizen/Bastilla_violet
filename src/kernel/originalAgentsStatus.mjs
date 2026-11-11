export const ORIGINAL_AGENT_NAMES = Object.freeze(['Alex', 'Aria', 'Astyria', 'Aurelius']);
export const ORIGINAL_AGENT_SOURCE_REPOSITORY = 'u6930438163-code/AI_Studio_BastillaOS';
export const ORIGINAL_AGENT_TARGET_REPOSITORY = 'u6930438163-code/Debian_13_Trixie';

const CAPABILITIES_PATH = '/api/agent-tasks/capabilities';
const WORKERS_PATH = '/api/agent-tasks/workers';
const VALID_SOURCE_STATES = new Set(['disabled', 'provider_unavailable', 'idle', 'running']);
const MAX_SOURCE_RESPONSE_BYTES = 32 * 1024;

const disconnected = (reason) => ({
  connection: 'not_connected',
  reason,
  sourceRepository: ORIGINAL_AGENT_SOURCE_REPOSITORY,
  targetRepository: ORIGINAL_AGENT_TARGET_REPOSITORY,
  mode: 'model_review_only',
  agents: ORIGINAL_AGENT_NAMES.map((name) => ({ name, state: 'not_connected', sourceState: 'unknown' })),
});

const blocked = (reason) => ({
  connection: 'blocked',
  reason,
  sourceRepository: ORIGINAL_AGENT_SOURCE_REPOSITORY,
  targetRepository: ORIGINAL_AGENT_TARGET_REPOSITORY,
  mode: 'model_review_only',
  agents: ORIGINAL_AGENT_NAMES.map((name) => ({ name, state: 'blocked', sourceState: 'unknown' })),
});

function getSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isCanonicalAgentList(agents) {
  return Array.isArray(agents) && agents.length === ORIGINAL_AGENT_NAMES.length
    && ORIGINAL_AGENT_NAMES.every((name) => agents.includes(name));
}

function hasExpectedIdentity(capabilities, workers) {
  return capabilities?.sourceRepository === ORIGINAL_AGENT_SOURCE_REPOSITORY
    && capabilities?.protocolVersion === 1
    && capabilities?.mode === 'model_review_only'
    && capabilities?.workerExecutionVerified === false
    && Array.isArray(capabilities?.capabilities)
    && isCanonicalAgentList(capabilities?.agents)
    && workers?.sourceRepository === ORIGINAL_AGENT_SOURCE_REPOSITORY
    && workers?.targetRepository === ORIGINAL_AGENT_TARGET_REPOSITORY
    && workers?.protocolVersion === 1
    && workers?.mode === 'model_review_only'
    && Array.isArray(workers?.agents)
    && isCanonicalAgentList(workers?.agents?.map((agent) => agent?.name));
}

function isFreshHeartbeat(value, now) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now - timestamp >= -5000 && now - timestamp <= 30000;
}

async function readJsonResponse(response) {
  const declaredLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_RESPONSE_BYTES) {
    throw new Error('source_response_too_large');
  }
  const reader = response.body?.getReader?.();
  if (!reader) return response.json();

  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_SOURCE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('source_response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function fetchOriginalAgentsStatus({
  baseUrl = process.env.SVL_ORIGINAL_AGENTS_URL,
  token = process.env.DEBIAN13_ORIGINAL_AGENTS_TOKEN,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  timeoutMs = 3000,
} = {}) {
  if (!baseUrl || !token) return disconnected('credentials_not_configured');

  const sourceUrl = getSourceUrl(baseUrl);
  if (!sourceUrl) return blocked('invalid_source_url');
  if (typeof token !== 'string' || token.trim().length < 32 || token.trim().length > 512) {
    return blocked('invalid_source_credentials');
  }
  if (typeof fetchImpl !== 'function') return disconnected('source_unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const readEndpoint = async (endpoint) => {
    const response = await fetchImpl(`${sourceUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: ['Bear', 'er', token.trim()].join(' '),
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error('source_request_failed');
      Object.assign(error, { status: response.status });
      throw error;
    }
    return readJsonResponse(response);
  };

  try {
    const [capabilities, workers] = await Promise.all([
      readEndpoint(CAPABILITIES_PATH),
      readEndpoint(WORKERS_PATH),
    ]);
    if (!hasExpectedIdentity(capabilities, workers)
      || workers.agents.some((agent) => !VALID_SOURCE_STATES.has(agent.state))) {
      return blocked('source_contract_mismatch');
    }

    return {
      connection: 'connected',
      reason: 'source_worker_cannot_execute_code_in_this_repository',
      sourceRepository: ORIGINAL_AGENT_SOURCE_REPOSITORY,
      targetRepository: ORIGINAL_AGENT_TARGET_REPOSITORY,
      mode: 'model_review_only',
      capabilities: capabilities.capabilities.filter((capability) =>
        capability === 'debian13_review_task_v1' || capability === 'debian13_agent_message_v1'),
      agents: workers.agents.map((agent) => ({
        name: agent.name,
        state: 'blocked',
        sourceState: agent.state === 'running' && agent.workerVerified === true
          && isFreshHeartbeat(agent.heartbeatAt, now) ? 'running' : agent.state === 'running' ? 'unknown' : agent.state,
        heartbeatAt: isFreshHeartbeat(agent.heartbeatAt, now) ? agent.heartbeatAt : null,
      })),
    };
  } catch (error) {
    return disconnected(error?.name === 'AbortError'
      ? 'source_timeout'
      : error?.status === 401 || error?.status === 403
        ? 'source_auth_failed'
        : 'source_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
