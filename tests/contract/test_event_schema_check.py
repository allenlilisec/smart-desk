"""event-schema-check 单元测试（门禁 G-X-E）。

验证工具能正确：
1. 拦截 B1 漂移：ticket.status_changed 用 from/to 顶替 from_status/to_status 且缺
   requester_id（非零退出，同时报「缺 required」与「未定义字段」）；
2. 放行合规发布点（含「仅缺 optional 字段」的向后兼容场景）；
3. allowlist 能放行意图性新增的额外字段。
"""

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "event_schema_check.py"
DRIFT_CONFIG = REPO_ROOT / "tests" / "contract" / "event-schema-check.drift.test.json"
OK_CONFIG = REPO_ROOT / "tests" / "contract" / "event-schema-check.ok.test.json"


def run_check(config: Path) -> subprocess.CompletedProcess:
    # 强制子进程以 UTF-8 输出，避免 Windows 本机 GBK 控制台导致中文解码失败
    # （CI 为 Linux/UTF-8，本地 Windows 亦需稳定通过）。
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--config", str(config)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )


def test_b1_drift_is_blocked():
    result = run_check(DRIFT_CONFIG)
    output = result.stdout + result.stderr

    assert result.returncode == 1, f"期望拦截 B1 漂移返回 1，实际 {result.returncode}。输出：\n{output}"
    assert "DRIFT" in output, f"未发现 DRIFT 标记。输出：\n{output}"
    assert "ticket.status_changed" in output, f"未定位到漂移事件。输出：\n{output}"
    # 改名表现为「缺 required 原名」+「多未知新名」两条同时命中
    assert "requester_id" in output, f"未报缺 required requester_id。输出：\n{output}"
    assert "to_status" in output, f"未报缺 required to_status。输出：\n{output}"
    assert "'from'" in output and "'to'" in output, f"未报未定义字段 from/to。输出：\n{output}"


def test_compliant_publishers_pass():
    result = run_check(OK_CONFIG)
    output = result.stdout + result.stderr

    assert result.returncode == 0, f"期望合规发布点放行返回 0，实际 {result.returncode}。输出：\n{output}"
    assert "未发现事件 payload 字段漂移" in output, f"未确认放行。输出：\n{output}"
    # ticket.created 仅给 required、省略 optional，应被放行（向后兼容）
    assert "ticket.created -> TicketCreatedPayload" in output, f"未放行 created 发布点。输出：\n{output}"


_EXTRA_FIELD_PUBLISHER = '''\
def publish_created_with_extra(bus, t):
    bus.publish({
        "event_type": "ticket.created",
        "payload": {
            "requester_id": t.requester_id,
            "title": t.title,
            "trace_id": t.trace_id,
        },
    })
'''


def _run_with_temp(fixture_dir_name: str, allowlist: dict) -> subprocess.CompletedProcess:
    """在 repo 内写临时 fixture + config 后运行（保证 repo_root 解析到 src/openapi）。"""
    base = REPO_ROOT / "tests" / "contract" / "fixtures" / fixture_dir_name
    base.mkdir(parents=True, exist_ok=True)
    (base / "extra_publisher.py").write_text(_EXTRA_FIELD_PUBLISHER, encoding="utf-8")
    cfg = {
        "schema_spec": "src/openapi/insight.yaml",
        "roots": [{"name": "extra", "path": f"tests/contract/fixtures/{fixture_dir_name}"}],
        "exclude_dirs": [],
        "allowlist": allowlist,
    }
    cfg_path = REPO_ROOT / "tests" / "contract" / f"_tmp_{fixture_dir_name}.json"
    cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
    try:
        return run_check(cfg_path)
    finally:
        (base / "extra_publisher.py").unlink(missing_ok=True)
        try:
            base.rmdir()
        except OSError:
            pass
        cfg_path.unlink(missing_ok=True)


def test_extra_field_fails_without_allowlist():
    result = _run_with_temp("_event_extra_no_allow", allowlist={})
    output = result.stdout + result.stderr
    assert result.returncode == 1, f"未 allowlist 的额外字段应拦截。输出：\n{output}"
    assert "trace_id" in output, f"未报未定义字段 trace_id。输出：\n{output}"


def test_allowlist_permits_intentional_extra_field():
    result = _run_with_temp(
        "_event_extra_allow", allowlist={"TicketCreatedPayload": ["trace_id"]}
    )
    output = result.stdout + result.stderr
    assert result.returncode == 0, f"allowlist 应放行意图性新增字段。输出：\n{output}"


if __name__ == "__main__":
    test_b1_drift_is_blocked()
    test_compliant_publishers_pass()
    test_extra_field_fails_without_allowlist()
    test_allowlist_permits_intentional_extra_field()
    print("所有 event-schema-check 测试通过。")
