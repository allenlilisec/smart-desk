"""模拟 smartdesk-insight 调用 core 用户目录做跨租户校验。

本文件仅用于 api-contract-check 调用方路径断言测试。
"""

import requests

CORE_BASE_URL = "http://smartdesk-core.internal/v1"


def resolve_user_org_correct(user_id: str, token: str) -> dict:
    """符合 SUP-303 终裁的新路径。"""
    url = CORE_BASE_URL + "/internal/users/" + user_id
    resp = requests.get(url, headers={"Authorization": "Bearer " + token})
    resp.raise_for_status()
    return resp.json()


def resolve_user_org_drift(user_id: str, token: str) -> dict:
    """SUP-303 之前废弃的旧路径，应被 api-contract-check 拦截。"""
    url = CORE_BASE_URL + "/config/users/" + user_id
    resp = requests.get(url, headers={"Authorization": "Bearer " + token})
    resp.raise_for_status()
    return resp.json()
