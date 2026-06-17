// 模拟 smartdesk-gateway 调用 core 内部端点。
// 本文件仅用于 api-contract-check 调用方路径断言测试。

const CORE_BASE = 'http://smartdesk-core.internal/v1';

export async function getTicket(id: string, token: string) {
  const resp = await fetch('http://smartdesk-core.internal/v1/tickets/' + id, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  });
  return resp.json();
}

export async function createTicket(payload: object, token: string) {
  const resp = await fetch(CORE_BASE + '/tickets', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return resp.json();
}
