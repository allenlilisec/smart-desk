#!/usr/bin/env python3
"""api-contract-check: 自动断言调用方端点路径与 OpenAPI 提供方契约一致。

用法：
    python scripts/api_contract_check.py [--config scripts/api-contract-check.json]

退出码：
    0 — 未发现问题
    1 — 发现路径漂移、方法不匹配或调用已废弃路径
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import yaml


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    source: str

    def __str__(self) -> str:
        return f"{self.method.upper()} {self.path}"


@dataclass
class Provider:
    name: str
    spec_path: Path
    base_paths: List[str] = field(default_factory=list)
    endpoints: Dict[str, Endpoint] = field(default_factory=dict)

    def load(self) -> None:
        data = yaml.safe_load(self.spec_path.read_text(encoding="utf-8"))
        servers = data.get("servers", [])
        self.base_paths = []
        for srv in servers:
            url = srv.get("url", "") if isinstance(srv, dict) else str(srv)
            # 取 URL 的路径部分作为可能的前缀
            if url:
                from urllib.parse import urlparse

                parsed = urlparse(url)
                if parsed.path and parsed.path != "/":
                    self.base_paths.append(parsed.path.rstrip("/"))

        for path, path_item in data.get("paths", {}).items():
            if not isinstance(path_item, dict):
                continue
            for method in ("get", "post", "put", "patch", "delete", "head", "options"):
                if method in path_item:
                    ep = Endpoint(method=method, path=path, source=f"{self.spec_path}:{path}")
                    self.endpoints[f"{method.upper()} {path}"] = ep


@dataclass
class Consumer:
    name: str
    root: Path
    provider_names: List[str]
    deprecated_paths: List[str]
    discovered: List[Tuple[Endpoint, Optional[str]]] = field(default_factory=list)


# 匹配常见 HTTP 客户端调用中的路径字面量
# 1) fetch('/v1/tickets') / axios.get('/v1/tickets') / requests.get(url='...')
# 2) http_client.get('/v1/tickets')
# 3) 完整 URL: http://smartdesk-core.internal/v1/tickets/{id}
_PATH_RE = re.compile(
    r'["\']((?:https?://[^"\'\s]+)?/[a-zA-Z0-9_\-/{.}]+)["\']'
)

# 从调用上下文中尝试提取 HTTP 方法
_METHOD_HINT_RE = re.compile(
    r"\b(fetch|axios|http_client|requests)\s*\.\s*(get|post|put|patch|delete)\s*\(",
    re.IGNORECASE,
)


def _strip_base_path(path: str, base_paths: List[str]) -> str:
    """如果调用路径以提供方 basePaths 开头，则去掉前缀。"""
    for bp in sorted(base_paths, key=len, reverse=True):
        if path.startswith(bp + "/") or path == bp:
            return path[len(bp) :] or "/"
    return path


def _is_just_base_url(path: str, base_paths: List[str]) -> bool:
    """判断路径是否只是某个提供方的 base URL（如 http://core.internal/v1）。"""
    from urllib.parse import urlparse

    parsed = urlparse(path)
    path_only = parsed.path or "/"
    for bp in base_paths:
        if path_only.rstrip("/") == bp.rstrip("/"):
            return True
    return False


def _path_to_regex(template: str) -> re.Pattern[str]:
    """把 /tickets/{id}/comments 转成 /^/tickets/[^/]+/comments$"""
    escaped = re.escape(template)
    # {param} -> [^/]+
    pattern = re.sub(r"\\\{[^}]+\\\}", r"[^/]+", escaped)
    return re.compile(f"^{pattern}$")


def _match_endpoint(path: str, providers: List[Provider]) -> Optional[Endpoint]:
    """用模板匹配返回第一个命中的提供方端点（不考虑方法）。

    支持路径末尾为动态参数时的兜底匹配：例如调用方代码拼接 user_id 后路径为
    /internal/users/，契约路径为 /internal/users/{userId}，此时也能命中。
    """
    candidates = [path]
    if path.endswith("/"):
        candidates.append(path + "{__auto__}")

    for candidate in candidates:
        for provider in providers:
            for ep in provider.endpoints.values():
                if _path_to_regex(ep.path).match(candidate):
                    return ep
    return None


def _match_method(path: str, method: str, providers: List[Provider]) -> Optional[Endpoint]:
    candidates = [path]
    if path.endswith("/"):
        candidates.append(path + "{__auto__}")

    for candidate in candidates:
        for provider in providers:
            key = f"{method.upper()} {candidate}"
            if key in provider.endpoints:
                return provider.endpoints[key]
            # 模板匹配
            for ep in provider.endpoints.values():
                if ep.method == method.upper() and _path_to_regex(ep.path).match(candidate):
                    return ep
    return None


def _extract_method_from_line(line: str) -> Optional[str]:
    m = _METHOD_HINT_RE.search(line)
    if m:
        return m.group(2).lower()
    # 兜底：检测 method: 'POST' / method: "POST"
    method_literal = re.search(r"method\s*[:=]\s*['\"]([A-Za-z]+)['\"]", line)
    if method_literal:
        return method_literal.group(1).lower()
    return None


def _discover_calls(consumer: Consumer, providers: List[Provider], exclude_dirs: List[str], repo_root: Path) -> List[Tuple[Endpoint, Optional[str]]]:
    """扫描消费者代码，返回 (Endpoint, 检测到的方法提示)。"""
    calls: List[Tuple[Endpoint, Optional[str]]] = []
    if not consumer.root.exists():
        return calls

    base_paths = []
    for provider in providers:
        base_paths.extend(provider.base_paths)

    # 扫描常见源码文件
    extensions = (".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".java", ".kt", ".cs")
    for ext in extensions:
        for file_path in consumer.root.rglob(f"*{ext}"):
            if any(part in ("node_modules", "vendor") for part in file_path.parts):
                continue
            try:
                rel = file_path.relative_to(repo_root).as_posix()
            except ValueError:
                rel = file_path.as_posix()
            if any(rel.startswith(d.rstrip("/") + "/") or rel == d.rstrip("/") for d in exclude_dirs):
                continue
            try:
                text = file_path.read_text(encoding="utf-8")
            except Exception:
                continue
            for lineno, line in enumerate(text.splitlines(), start=1):
                method_hint = _extract_method_from_line(line)
                for match in _PATH_RE.finditer(line):
                    raw_path = match.group(1)
                    # 去掉 query/hash
                    path = raw_path.split("?")[0].split("#")[0]
                    # 忽略只是 base URL 的常量
                    if _is_just_base_url(path, base_paths):
                        continue
                    ep = Endpoint(
                        method=method_hint or "get",
                        path=path,
                        source=f"{file_path}:{lineno}",
                    )
                    calls.append((ep, method_hint))
    return calls


def _is_deprecated(path: str, deprecated_templates: List[str]) -> bool:
    return _find_deprecated_template(path, deprecated_templates) is not None


def _find_deprecated_template(path: str, deprecated_templates: List[str]) -> Optional[str]:
    candidates = [path]
    if path.endswith("/"):
        candidates.append(path + "{__auto__}")
    for tmpl in deprecated_templates:
        regex = _path_to_regex(tmpl)
        for candidate in candidates:
            if regex.match(candidate):
                return tmpl
    return None


def _find_repo_root(config_path: Path) -> Path:
    """向上查找包含 src/openapi 的目录作为仓库根目录。"""
    current = config_path.resolve().parent
    for _ in range(10):  # 防止无限向上
        if (current / "src" / "openapi").is_dir():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    # 兜底：使用配置文件的上两级目录
    return config_path.resolve().parent.parent


def _load_config(config_path: Path) -> Tuple[Dict[str, Provider], List[Consumer]]:
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    repo_root = _find_repo_root(config_path)

    providers: Dict[str, Provider] = {}
    for name, rel_path in cfg.get("providers", {}).items():
        provider = Provider(name=name, spec_path=repo_root / rel_path)
        provider.load()
        providers[name] = provider

    consumers: List[Consumer] = []
    for item in cfg.get("consumers", []):
        consumers.append(
            Consumer(
                name=item["name"],
                root=repo_root / item["root"],
                provider_names=item.get("providers", []),
                deprecated_paths=item.get("deprecated_paths", []),
            )
        )

    return providers, consumers


def run(config_path: Path) -> int:
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    providers, consumers = _load_config(config_path)
    repo_root = _find_repo_root(config_path)

    ignore_paths: set[str] = set(cfg.get("ignore_literal_paths", []))
    exclude_dirs: List[str] = cfg.get("exclude_dirs", [])

    errors: List[str] = []
    warnings: List[str] = []
    ok_count = 0

    for consumer in consumers:
        consumer_providers = [providers[n] for n in consumer.provider_names if n in providers]
        if not consumer.root.exists():
            print(f"[INFO] 消费者 {consumer.name} 目录不存在，跳过扫描: {consumer.root}")
            continue

        calls = _discover_calls(consumer, consumer_providers, exclude_dirs, repo_root)
        for call_ep, method_hint in calls:
            # 去掉 scheme/host，只保留路径部分
            from urllib.parse import urlparse

            parsed = urlparse(call_ep.path)
            stripped = parsed.path or call_ep.path

            # 去掉 provider basePath 前缀
            for provider in consumer_providers:
                stripped = _strip_base_path(stripped, provider.base_paths)
                if stripped != (parsed.path or call_ep.path):
                    break

            # 全局忽略的非 API 路径字面量（如 cookie path、docs 页）
            if stripped in ignore_paths or (parsed.path or call_ep.path) in ignore_paths:
                continue

            # 废弃路径优先报错
            matched_deprecated = _find_deprecated_template(stripped, consumer.deprecated_paths)
            if matched_deprecated:
                errors.append(
                    f"[DRIFT-DEPRECATED] {consumer.name} 调用已废弃路径: "
                    f"{call_ep.method.upper()} {call_ep.path} (规范化: {stripped}) "
                    f"命中废弃模板: {matched_deprecated} "
                    f"at {call_ep.source}"
                )
                continue

            matched = _match_endpoint(stripped, consumer_providers)
            if matched is None:
                errors.append(
                    f"[DRIFT-UNKNOWN] {consumer.name} 调用路径未在提供方契约中定义: "
                    f"{call_ep.method.upper()} {call_ep.path} (规范化: {stripped}) "
                    f"at {call_ep.source}"
                )
                continue

            # 如果方法能推断出来，再校验方法
            if method_hint:
                method_match = _match_method(stripped, method_hint, consumer_providers)
                if method_match is None:
                    errors.append(
                        f"[DRIFT-METHOD] {consumer.name} 路径匹配但方法不一致: "
                        f"调用 {call_ep.method.upper()} {call_ep.path} vs 契约 "
                        f"{matched} at {call_ep.source}"
                    )
                    continue

            ok_count += 1
            print(f"[OK] {consumer.name}: {call_ep.method.upper()} {call_ep.path} -> {matched}")

    print()
    if warnings:
        for w in warnings:
            print(w)
    if errors:
        print(f"发现 {len(errors)} 处调用方路径漂移/不一致：")
        for e in errors:
            print(e)
        print()
        print(f"通过检查: {ok_count} 处")
        return 1

    print(f"通过检查: {ok_count} 处；未发现调用方路径漂移。")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="api-contract-check 调用方路径断言")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).with_name("api-contract-check.json"),
        help="配置文件路径",
    )
    args = parser.parse_args(argv)
    return run(args.config)


if __name__ == "__main__":
    sys.exit(main())
