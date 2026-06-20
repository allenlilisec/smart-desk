#!/usr/bin/env python3
"""event-schema-check（门禁 G-X-E）：跨服务领域事件 payload 与冻结契约逐字段比对。

扫描各服务发布点构造的事件 payload，按信封 ``event_type`` 映射到
``src/openapi/insight.yaml`` 中冻结的 payload schema，逐字段比对 ``required`` /
``properties``，发现字段漂移（改名 / 缺失 / 未定义新字段）即非零退出。

与 ``api_contract_check.py`` 双检（G-X 校端点路径，G-X-E 校事件 payload 字段）。

用法：
    python scripts/event_schema_check.py [--config scripts/event-schema-check.json]

退出码（与 api_contract_check.py 对齐）：
    0 — 无漂移
    1 — 发现漂移 / 缺 required 字段 / 出现 schema 未定义字段
    2 — 用法 / 解析错误（配置缺失、YAML 解析失败、映射到的 schema 不存在等）

设计要点（架构约束，见 SUP-414 / SUP-17 裁决⑤）：
  1. 选型以信封 ``event_type`` 为权威，硬编码映射到 payload schema（下方
     ``EVENT_TYPE_TO_SCHEMA``），不依赖 JSON-Schema oneOf 的运行时判别。
  2. schema 事实源是契约 YAML 本身，运行时解析其 ``components.schemas.<Payload>``
     的 ``required`` 与 ``properties`` 键集，脚本不内嵌字段定义副本——契约演进时
     门禁自动跟随。
  3. 比对判定：对每个发布点提取构造的 payload 字段名集合 F，对照 schema 的
     properties 键集 P、required 集 R：
       - 缺失 required（R - F 非空）→ FAIL；
       - 出现未定义字段（F - P - allowlist 非空）→ FAIL（拦截改名：改名 = 缺原名
         + 多新名，两条同时命中）；
       - 仅缺 optional 字段 → 放行（version 内向后兼容增量演进）。

发布点识别策略与局限：见模块底部 ``_PUBLISH_POINT_STRATEGY`` 文档串及 README。
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import yaml


# ---- 架构约束①：信封 event_type → payload schema 硬编码映射（与契约 §3.1 表一致）----
# 不在此表内的 event_type（如 ticket.commented / ticket.merged，M4 固化前为自由
# object）不做字段比对，仅 INFO 记录。
EVENT_TYPE_TO_SCHEMA: Dict[str, str] = {
    "ticket.created": "TicketCreatedPayload",
    "ticket.assigned": "TicketAssignedPayload",
    "ticket.reassigned": "TicketAssignedPayload",
    "ticket.status_changed": "TicketStatusChangedPayload",
    "ticket.resolved": "TicketResolvedPayload",
    "ticket.closed": "TicketResolvedPayload",
    "ticket.reopened": "TicketResolvedPayload",
    "ticket.sla_warning": "TicketSlaPayload",
    "ticket.sla_breached": "TicketSlaPayload",
    "insight.classification_suggested": "ClassificationSuggestedPayload",
}


class UsageError(Exception):
    """配置 / 解析类错误，对应退出码 2。"""


@dataclass(frozen=True)
class SchemaShape:
    name: str
    required: Set[str]
    properties: Set[str]


@dataclass
class PublishPoint:
    event_type: str
    fields: Set[str]
    source: str  # file:line

    def __str__(self) -> str:
        return f"{self.event_type} @ {self.source}"


# --------------------------------------------------------------------------- #
# 契约 schema 加载
# --------------------------------------------------------------------------- #
def _load_schema_shapes(spec_path: Path) -> Dict[str, SchemaShape]:
    if not spec_path.exists():
        raise UsageError(f"契约 schema 文件不存在: {spec_path}")
    try:
        data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise UsageError(f"解析契约 YAML 失败 {spec_path}: {exc}") from exc

    schemas = (((data or {}).get("components") or {}).get("schemas") or {})
    shapes: Dict[str, SchemaShape] = {}
    for name, body in schemas.items():
        if not isinstance(body, dict):
            continue
        required = set(body.get("required", []) or [])
        properties = set((body.get("properties") or {}).keys())
        shapes[name] = SchemaShape(name=name, required=required, properties=properties)
    return shapes


# --------------------------------------------------------------------------- #
# 发布点扫描：从源码定位 event_type 字面量并提取其 payload 对象的字段名集合
# --------------------------------------------------------------------------- #
_PUBLISH_POINT_STRATEGY = """\
发布点识别策略（轻量词法扫描，跨 Python / TS / JS / Go 结构体字面量通用）：

  1. 在源码中定位 `event_type` 被赋为已知字面量的位置：
        event_type [:=] "<literal>"   （支持单/双引号、可选键引号、键值号 : 或 =）
  2. 为每个 event_type，配对其作用域内最近的 `payload` 对象字面量：
        payload [:=] { ... }
     配对窗口限定在「上一个 event_type 与下一个 event_type 之间」，优先取
     event_type 之后出现的 payload 块，否则回溯其之前的 payload 块——保证同一文件
     内多个发布点不会串位。
  3. 用括号配平 + 字符串感知扫描，提取该 payload 对象**顶层**键名集合 F
     （忽略嵌套对象内部键、字符串内的伪键、`[]`/`()` 内的内容）。

局限（误报 / 漏报，见 README 误报处理路径）：
  - payload 作为变量传入（payload=build_xxx()）而非内联字面量时无法提取字段——
    漏报，需发布点使用内联字面量或在 config.allowlist 标注；
  - 字典展开 `**base` / JS 展开 `...base` 引入的字段不可见——可能漏报；
  - 动态键（`payload[key] = v`）不计入；
  - 不在 EVENT_TYPE_TO_SCHEMA 表内的 event_type 跳过比对（仅 INFO）。
意图性新增 optional 字段在 bump version 前，临时写入 config.allowlist.<SchemaName>
放行，并记 version 演进 TODO。
"""

_QUOTES = ("'", '"')
_IDENT = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.")


def _find_event_type_literals(text: str) -> List[Tuple[int, str]]:
    """返回 [(offset, event_type), ...]，按出现顺序。"""
    out: List[Tuple[int, str]] = []
    needle = "event_type"
    i = 0
    n = len(text)
    while True:
        idx = text.find(needle, i)
        if idx == -1:
            break
        i = idx + len(needle)
        # 必须是独立 token（前后不是标识符字符），排除 e.g. my_event_type_x
        before = text[idx - 1] if idx > 0 else ""
        after = text[i] if i < n else ""
        if before in _IDENT or after in _IDENT:
            continue
        # 跳过可选闭合引号、空白、键值号、空白、开引号
        j = i
        if j < n and text[j] in _QUOTES:
            j += 1
        while j < n and text[j] in " \t":
            j += 1
        if j >= n or text[j] not in ":=":
            continue
        j += 1
        while j < n and text[j] in " \t":
            j += 1
        if j >= n or text[j] not in _QUOTES:
            continue
        quote = text[j]
        end = text.find(quote, j + 1)
        if end == -1:
            continue
        value = text[j + 1:end]
        out.append((idx, value))
    return out


def _find_payload_objects(text: str) -> List[Tuple[int, Set[str]]]:
    """返回 [(offset_of_payload_keyword, top_level_keys), ...]。"""
    out: List[Tuple[int, Set[str]]] = []
    needle = "payload"
    i = 0
    n = len(text)
    while True:
        idx = text.find(needle, i)
        if idx == -1:
            break
        i = idx + len(needle)
        before = text[idx - 1] if idx > 0 else ""
        after = text[i] if i < n else ""
        if before in _IDENT or after in _IDENT:
            continue
        j = i
        if j < n and text[j] in _QUOTES:
            j += 1
        while j < n and text[j] in " \t":
            j += 1
        if j >= n or text[j] not in ":=":
            continue
        j += 1
        while j < n and text[j] in " \t\r\n":
            j += 1
        if j >= n or text[j] != "{":
            continue
        keys = _extract_object_keys(text, j)
        if keys is not None:
            out.append((idx, keys))
    return out


def _extract_object_keys(text: str, brace_idx: int) -> Optional[Set[str]]:
    """text[brace_idx] == '{'，提取该对象**顶层**键名集合。括号不配平返回 None。"""
    keys: Set[str] = set()
    depth = 0
    n = len(text)
    expecting_key = False
    k = brace_idx
    while k < n:
        c = text[k]
        if c in _QUOTES:
            # 跳过字符串；若处于顶层期望键位置，记录其为键（下一非空字符须是 :）
            quote = c
            end = k + 1
            while end < n:
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == quote:
                    break
                end += 1
            literal = text[k + 1:end]
            if depth == 1 and expecting_key:
                m = end + 1
                while m < n and text[m] in " \t\r\n":
                    m += 1
                if m < n and text[m] == ":":
                    keys.add(literal)
                    expecting_key = False
            k = end + 1
            continue
        if c == "{":
            depth += 1
            if depth == 1:
                expecting_key = True
            k += 1
            continue
        if c == "}":
            depth -= 1
            if depth == 0:
                return keys
            k += 1
            continue
        if c in "[(":
            depth += 1
            k += 1
            continue
        if c in "])":
            depth -= 1
            k += 1
            continue
        if c == "," and depth == 1:
            expecting_key = True
            k += 1
            continue
        if depth == 1 and expecting_key and c in _IDENT and c != ".":
            # 裸标识符键（JS/TS/Go 结构体字段名）
            start = k
            while k < n and text[k] in _IDENT:
                k += 1
            ident = text[start:k]
            m = k
            while m < n and text[m] in " \t\r\n":
                m += 1
            if m < n and text[m] == ":":
                keys.add(ident)
                expecting_key = False
            continue
        k += 1
    return None  # 未闭合


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _scan_file(path: Path, rel: str) -> List[PublishPoint]:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return []
    events = _find_event_type_literals(text)
    payloads = _find_payload_objects(text)
    if not events:
        return []

    points: List[PublishPoint] = []
    for i, (off, etype) in enumerate(events):
        prev_off = events[i - 1][0] if i > 0 else -1
        next_off = events[i + 1][0] if i + 1 < len(events) else len(text)
        # 同一作用域内（prev_event, next_event），优先 event_type 之后的 payload
        after = [p for p in payloads if off < p[0] < next_off]
        before = [p for p in payloads if prev_off < p[0] < off]
        chosen: Optional[Tuple[int, Set[str]]] = None
        if after:
            chosen = min(after, key=lambda p: p[0])
        elif before:
            chosen = max(before, key=lambda p: p[0])
        if chosen is None:
            continue
        points.append(
            PublishPoint(
                event_type=etype,
                fields=chosen[1],
                source=f"{rel}:{_line_of(text, off)}",
            )
        )
    return points


_SCAN_EXTENSIONS = (".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".java", ".kt", ".cs")
_ALWAYS_SKIP = ("node_modules", "vendor", ".git", "__pycache__")


def _scan_root(root: Path, repo_root: Path, exclude_dirs: List[str]) -> List[PublishPoint]:
    points: List[PublishPoint] = []
    for ext in _SCAN_EXTENSIONS:
        for file_path in root.rglob(f"*{ext}"):
            if any(part in _ALWAYS_SKIP for part in file_path.parts):
                continue
            try:
                rel = file_path.relative_to(repo_root).as_posix()
            except ValueError:
                rel = file_path.as_posix()
            if any(rel.startswith(d.rstrip("/") + "/") or rel == d.rstrip("/") for d in exclude_dirs):
                continue
            points.extend(_scan_file(file_path, rel))
    return points


# --------------------------------------------------------------------------- #
# 配置
# --------------------------------------------------------------------------- #
def _find_repo_root(config_path: Path) -> Path:
    current = config_path.resolve().parent
    for _ in range(10):
        if (current / "src" / "openapi").is_dir():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return config_path.resolve().parent.parent


@dataclass
class Config:
    schema_spec: Path
    roots: List[Tuple[str, Path]] = field(default_factory=list)
    exclude_dirs: List[str] = field(default_factory=list)
    allowlist: Dict[str, Set[str]] = field(default_factory=dict)


def _load_config(config_path: Path) -> Tuple[Config, Path]:
    if not config_path.exists():
        raise UsageError(f"配置文件不存在: {config_path}")
    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise UsageError(f"解析配置 JSON 失败 {config_path}: {exc}") from exc

    repo_root = _find_repo_root(config_path)
    spec_rel = cfg.get("schema_spec") or "src/openapi/insight.yaml"
    roots: List[Tuple[str, Path]] = []
    for item in cfg.get("roots", []):
        roots.append((item["name"], repo_root / item["path"]))
    allowlist = {k: set(v) for k, v in (cfg.get("allowlist") or {}).items()}
    config = Config(
        schema_spec=repo_root / spec_rel,
        roots=roots,
        exclude_dirs=cfg.get("exclude_dirs", []),
        allowlist=allowlist,
    )
    return config, repo_root


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def run(config_path: Path) -> int:
    config, repo_root = _load_config(config_path)
    shapes = _load_schema_shapes(config.schema_spec)

    errors: List[str] = []
    ok_count = 0
    skipped = 0

    for name, root in config.roots:
        if not root.exists():
            print(f"[INFO] 扫描根 {name} 不存在，跳过（CI 中子模块可能未检出）: {root}")
            continue
        points = _scan_root(root, repo_root, config.exclude_dirs)
        for pt in points:
            schema_name = EVENT_TYPE_TO_SCHEMA.get(pt.event_type)
            if schema_name is None:
                print(f"[INFO] {name}: event_type={pt.event_type} 未映射 payload schema，跳过 ({pt.source})")
                skipped += 1
                continue
            shape = shapes.get(schema_name)
            if shape is None:
                raise UsageError(
                    f"映射目标 schema 不存在于契约: {pt.event_type} -> {schema_name} "
                    f"（检查 EVENT_TYPE_TO_SCHEMA 与 {config.schema_spec.name} 是否一致）"
                )

            allow = config.allowlist.get(schema_name, set())
            missing_required = shape.required - pt.fields
            unknown = pt.fields - shape.properties - allow

            if missing_required or unknown:
                detail = []
                if missing_required:
                    detail.append(f"缺 required: {sorted(missing_required)}")
                if unknown:
                    detail.append(f"未定义字段: {sorted(unknown)}")
                errors.append(
                    f"[DRIFT] {name}: {pt.event_type} -> {schema_name} "
                    f"{'；'.join(detail)} | 构造字段={sorted(pt.fields)} "
                    f"契约 required={sorted(shape.required)} properties={sorted(shape.properties)} "
                    f"at {pt.source}"
                )
                continue

            ok_count += 1
            print(f"[OK] {name}: {pt.event_type} -> {schema_name} 字段={sorted(pt.fields)} ({pt.source})")

    print()
    if errors:
        print(f"发现 {len(errors)} 处事件 payload 字段漂移：")
        for e in errors:
            print(e)
        print()
        print(f"通过: {ok_count} 处；跳过(未映射): {skipped} 处")
        return 1

    print(f"通过: {ok_count} 处；跳过(未映射): {skipped} 处；未发现事件 payload 字段漂移。")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="event-schema-check 事件 payload 字段断言（G-X-E）")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).with_name("event-schema-check.json"),
        help="配置文件路径",
    )
    args = parser.parse_args(argv)
    try:
        return run(args.config)
    except UsageError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
