// 저장된 "순서와 숨김"(/api/home)을 앱 목록(apps.json의 apps)에 덧씌운다. 공개 대문과 전용 대문이 같이 쓴다.
// arrangeApps(apps, saved) → [{ app, hidden }] (화면 순서)
//   saved가 없거나 모양이 이상하면 파일 순서 그대로, 숨김 없음.
//   저장 뒤에 apps.json에 새로 넣은 앱(저장된 순서에 없는 id)은 맨 위. 파일에서 사라진 id는 무시.
//   남아 있는 앱이 전부 숨김이 되면(다른 앱을 파일에서 지운 경우) 숨김을 무시해 대문이 비지 않게 한다.
// 검사는 test/home.test.mjs (node --test).
(function (root) {
  function arrangeApps(apps, saved) {
    var list = Array.isArray(apps) ? apps.filter(function (a) { return a && typeof a.id === 'string'; }) : [];
    var plain = list.map(function (a) { return { app: a, hidden: false }; });
    if (!saved || !Array.isArray(saved.order)) return plain;
    var pos = {}, hid = {};
    saved.order.forEach(function (id, i) { if (typeof id === 'string' && !(('$' + id) in pos)) pos['$' + id] = i; });
    (Array.isArray(saved.hidden) ? saved.hidden : []).forEach(function (id) { if (typeof id === 'string') hid['$' + id] = true; });
    var fresh = list.filter(function (a) { return !(('$' + a.id) in pos); });
    var known = list.filter(function (a) { return ('$' + a.id) in pos; })
      .sort(function (a, b) { return pos['$' + a.id] - pos['$' + b.id]; });
    var out = fresh.concat(known).map(function (a) { return { app: a, hidden: !!hid['$' + a.id] }; });
    return out.some(function (x) { return !x.hidden; }) ? out : plain.length ? out.map(function (x) { return { app: x.app, hidden: false }; }) : out;
  }
  root.arrangeApps = arrangeApps;
})(typeof window !== 'undefined' ? window : globalThis);
