"""api-contract-check 单元测试。

验证工具能正确：
1. 识别调用方代码中的跨服务端点路径；
2. 对正确路径通过检查；
3. 对 SUP-303 中的 /config/users/{userId} -> /internal/users/{userId} 漂移自动报错。
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "api_contract_check.py"
TEST_CONFIG = REPO_ROOT / "tests" / "contract" / "api-contract-check.test.json"


def run_check() -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--config", str(TEST_CONFIG)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def test_detects_drift_from_config_to_internal_users():
    result = run_check()
    output = result.stdout + result.stderr

    # 工具应以非零退出码报错
    assert result.returncode == 1, f"期望发现路径漂移并返回 1，实际返回 {result.returncode}。输出：\n{output}"

    # 必须包含对废弃路径 /config/users/{userId} 的报错
    assert "/config/users/{userId}" in output, f"未在输出中发现 /config/users/{{userId}} 漂移报错。输出：\n{output}"
    assert "DRIFT-DEPRECATED" in output, f"未在输出中发现 DRIFT-DEPRECATED 标记。输出：\n{output}"

    # 正确路径 /internal/users/{userId} 应被识别为 OK
    assert "/internal/users/" in output, f"未在输出中发现 /internal/users/ 正确路径。输出：\n{output}"


def test_ok_paths_are_reported():
    result = run_check()
    output = result.stdout + result.stderr

    # gateway 调用 core 的正确路径应出现在 OK 行
    assert "GET /tickets/" in output, f"未在输出中发现 tickets 路径。输出：\n{output}"


if __name__ == "__main__":
    test_detects_drift_from_config_to_internal_users()
    test_ok_paths_are_reported()
    print("所有 api-contract-check 测试通过。")
