package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/event"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/httpapi"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/store"
)

type rig struct {
	ts  *httptest.Server
	pub *event.InMemory
}

func newRig(t *testing.T) *rig {
	t.Helper()
	base := time.Date(2026, 6, 14, 9, 0, 0, 0, time.UTC)
	clock := func() time.Time { return base }
	st := store.New(base)
	pub := event.NewInMemory()
	srv := httpapi.New(st, pub, "default", clock)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &rig{ts: ts, pub: pub}
}

func (r *rig) doRaw(t *testing.T, method, path string, headers map[string]string, body any) (int, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, r.ts.URL+path, rdr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, raw
}

// do is for object responses (decodes into a map).
func (r *rig) do(t *testing.T, method, path string, headers map[string]string, body any) (int, map[string]any) {
	t.Helper()
	code, raw := r.doRaw(t, method, path, headers, body)
	out := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return code, out
}

// doArr is for bare-array responses (categories, sla-policies).
func (r *rig) doArr(t *testing.T, method, path string, headers map[string]string) (int, []any) {
	t.Helper()
	code, raw := r.doRaw(t, method, path, headers, nil)
	var out []any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return code, out
}

var (
	agent     = map[string]string{"X-User-Id": "11111111-1111-4111-8111-111111111111", "X-User-Roles": "agent"}
	requester = map[string]string{"X-User-Id": "22222222-2222-4222-8222-222222222222", "X-User-Roles": "requester"}
)

func TestClosedLoop_CreateToClose(t *testing.T) {
	r := newRig(t)

	// 建单
	code, tk := r.do(t, "POST", "/tickets", requester, map[string]any{
		"title": "VPN 连不上", "description": "在家无法连接公司 VPN", "priority": "P2",
	})
	if code != http.StatusCreated {
		t.Fatalf("create: got %d (%v)", code, tk)
	}
	id, _ := tk["id"].(string)
	if id == "" || tk["number"] == nil || tk["status"] != "new" {
		t.Fatalf("create payload unexpected: %v", tk)
	}

	// 详情含 SLA
	code, detail := r.do(t, "GET", "/tickets/"+id, agent, nil)
	if code != http.StatusOK || detail["sla"] == nil {
		t.Fatalf("detail missing sla: %d %v", code, detail)
	}

	// 受理
	mustStatus(t, r, id, "accept", "accepted")
	// 幂等：重复受理仍 200，状态不变
	code, again := r.do(t, "POST", "/tickets/"+id+"/transitions", agent, map[string]any{"action": "accept"})
	if code != http.StatusOK || again["status"] != "accepted" {
		t.Fatalf("idempotent accept: %d %v", code, again)
	}

	// 非法跃迁：accepted 直接 close → 409
	code, _ = r.do(t, "POST", "/tickets/"+id+"/transitions", agent, map[string]any{"action": "close"})
	if code != http.StatusConflict {
		t.Fatalf("illegal close: want 409 got %d", code)
	}

	// 处理中 → 等用户（SLA 暂停）
	mustStatus(t, r, id, "start", "in_progress")
	mustStatus(t, r, id, "wait_user", "pending_user")
	code, sla := r.do(t, "GET", "/tickets/"+id+"/sla", agent, nil)
	if code != http.StatusOK || sla["paused"] != true {
		t.Fatalf("sla should be paused: %d %v", code, sla)
	}

	// 报单人回复 → 自动恢复 in_progress (US-2.2 AC2)
	code, _ = r.do(t, "POST", "/tickets/"+id+"/comments", requester, map[string]any{
		"body": "试过了还是不行", "visibility": "public",
	})
	if code != http.StatusCreated {
		t.Fatalf("requester comment: %d", code)
	}
	code, after := r.do(t, "GET", "/tickets/"+id, agent, nil)
	if code != http.StatusOK || after["status"] != "in_progress" {
		t.Fatalf("user reply should auto-resume to in_progress, got %v", after["status"])
	}

	// 已解决 → 已关闭
	mustStatus(t, r, id, "resolve", "resolved")
	mustStatus(t, r, id, "close", "closed")

	// 事件序列校验
	types := r.pub.TypesFor(id)
	for _, want := range []string{"ticket.created", "ticket.resolved", "ticket.closed", "ticket.commented"} {
		if !contains(types, want) {
			t.Fatalf("missing event %q in %v", want, types)
		}
	}

	// 时间线非空且正序首条为 created
	code, tl := r.do(t, "GET", "/tickets/"+id+"/timeline", agent, nil)
	items, _ := tl["items"].([]any)
	if code != http.StatusOK || len(items) == 0 {
		t.Fatalf("timeline empty: %d %v", code, tl)
	}
	first, _ := items[0].(map[string]any)
	if first["event_type"] != "created" {
		t.Fatalf("timeline first entry should be created, got %v", first["event_type"])
	}
}

func TestCommentVisibility_RequesterCannotSeeInternal(t *testing.T) {
	r := newRig(t)
	_, tk := r.do(t, "POST", "/tickets", requester, map[string]any{"title": "x", "description": "y"})
	id := tk["id"].(string)

	// 坐席写公开评论 + 内部备注
	if code, _ := r.do(t, "POST", "/tickets/"+id+"/comments", agent, map[string]any{"body": "已收到", "visibility": "public"}); code != http.StatusCreated {
		t.Fatalf("public comment: %d", code)
	}
	if code, _ := r.do(t, "POST", "/tickets/"+id+"/comments", agent, map[string]any{"body": "疑似账号问题", "visibility": "internal"}); code != http.StatusCreated {
		t.Fatalf("internal note: %d", code)
	}

	// 报单人只看到 1 条；坐席看到 2 条
	_, asReq := r.do(t, "GET", "/tickets/"+id+"/comments", requester, nil)
	if total := asReq["total"]; total != float64(1) {
		t.Fatalf("requester should see 1 comment, got %v", total)
	}
	_, asAgent := r.do(t, "GET", "/tickets/"+id+"/comments", agent, nil)
	if total := asAgent["total"]; total != float64(2) {
		t.Fatalf("agent should see 2 comments, got %v", total)
	}

	// 报单人尝试写内部备注 → 403
	if code, _ := r.do(t, "POST", "/tickets/"+id+"/comments", requester, map[string]any{"body": "x", "visibility": "internal"}); code != http.StatusForbidden {
		t.Fatalf("requester internal note should be 403, got %d", code)
	}
}

func TestConfigSeedsAndHealth(t *testing.T) {
	r := newRig(t)
	if code, _ := r.do(t, "GET", "/healthz", nil, nil); code != http.StatusOK {
		t.Fatalf("healthz: %d", code)
	}
	if code, _ := r.do(t, "GET", "/readyz", nil, nil); code != http.StatusOK {
		t.Fatalf("readyz: %d", code)
	}
	code, cats := r.doArr(t, "GET", "/config/categories", agent)
	if code != http.StatusOK || len(cats) == 0 {
		t.Fatalf("expected seeded categories: %d %v", code, cats)
	}
	code, users := r.do(t, "GET", "/config/users", agent, nil)
	if code != http.StatusOK || users["total"] == float64(0) {
		t.Fatalf("expected seeded users, got %v", users)
	}
	code, pol := r.doArr(t, "GET", "/config/sla-policies", agent)
	if code != http.StatusOK || len(pol) == 0 {
		t.Fatalf("expected seeded sla policy, got %v", pol)
	}
}

func TestIdempotencyKey_DedupesCreate(t *testing.T) {
	r := newRig(t)
	h := map[string]string{"X-User-Id": requester["X-User-Id"], "X-User-Roles": "requester", "Idempotency-Key": "abc-123"}
	_, first := r.do(t, "POST", "/tickets", h, map[string]any{"title": "dup", "description": "d"})
	_, second := r.do(t, "POST", "/tickets", h, map[string]any{"title": "dup", "description": "d"})
	if first["id"] != second["id"] || first["number"] != second["number"] {
		t.Fatalf("idempotency-key should return same ticket: %v vs %v", first["id"], second["id"])
	}
}

// helpers

func mustStatus(t *testing.T, r *rig, id, action, want string) {
	t.Helper()
	code, body := r.do(t, "POST", "/tickets/"+id+"/transitions", agent, map[string]any{"action": action})
	if code != http.StatusOK {
		t.Fatalf("%s: want 200 got %d (%v)", action, code, body)
	}
	if body["status"] != want {
		t.Fatalf("%s: want status %q got %q", action, want, body["status"])
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
