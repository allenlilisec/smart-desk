-- 0002_seed_baseline.sql — CORE-C baseline config seed (idempotent).
-- SLA v1 baseline (1 business day = 480 min): P1 15m/4h; P2 60m/1bd;
-- P3 240m/3bd; P4 1bd/5bd. Source: openapi/core.yaml SlaPolicy.targets.

INSERT INTO sla_policies (id, org_id, name, active)
VALUES ('00000000-0000-0000-0000-0000000005a1', 'default', 'Default SLA v1', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sla_policy_targets (policy_id, priority, response_minutes, resolve_minutes) VALUES
    ('00000000-0000-0000-0000-0000000005a1', 'P1', 15,  240),
    ('00000000-0000-0000-0000-0000000005a1', 'P2', 60,  480),
    ('00000000-0000-0000-0000-0000000005a1', 'P3', 240, 1440),
    ('00000000-0000-0000-0000-0000000005a1', 'P4', 480, 2400)
ON CONFLICT (policy_id, priority) DO NOTHING;

-- Top-level taxonomy seed (codes stable; names can be edited via /config).
INSERT INTO categories (id, org_id, parent_id, code, name, active, sort) VALUES
    ('00000000-0000-0000-0000-0000000c0001', 'default', NULL, 'hardware', '硬件', true, 10),
    ('00000000-0000-0000-0000-0000000c0002', 'default', NULL, 'software', '软件', true, 20),
    ('00000000-0000-0000-0000-0000000c0003', 'default', NULL, 'account',  '账号与权限', true, 30),
    ('00000000-0000-0000-0000-0000000c0004', 'default', NULL, 'network',  '网络', true, 40),
    ('00000000-0000-0000-0000-0000000c0005', 'default', NULL, 'other',    '其他', true, 90)
ON CONFLICT (id) DO NOTHING;
