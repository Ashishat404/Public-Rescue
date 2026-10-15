const BASE = "/api";

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}

export const api = {
  incidents: () => call("/incidents"),
  teams: () => call("/teams"),
  report: (data) => call("/incidents", "POST", data),
  assign: (id, team_id) => call(`/incidents/${id}/assign`, "PATCH", { team_id }),
  setStatus: (id, status) => call(`/incidents/${id}/status`, "PATCH", { status }),
};
