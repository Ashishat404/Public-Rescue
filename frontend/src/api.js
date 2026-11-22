const BASE = "/api";

async function call(path, method = "GET", body) {
  const token = localStorage.getItem("rescue_staff_token");
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  signup: (data) => call("/auth/signup", "POST", data),
  staffUsers: () => call("/admin/users"),
  deleteStaffUser: (id) => call(`/admin/users/${id}`, "DELETE"),
  requestStaffAccess: (data) => call("/auth/staff/request", "POST", data),
  staffRequests: (status = "pending") => call(`/admin/staff-requests?status=${status}`),
  approveStaffRequest: (id, role = "staff") => call(`/admin/staff-requests/${id}/approve`, "POST", { role }),
  rejectStaffRequest: (id) => call(`/admin/staff-requests/${id}/reject`, "POST"),
  volunteerSignup: (data) => call("/auth/volunteer/signup", "POST", data),
  login: (data) => call("/auth/login", "POST", data),
  me: () => call("/auth/me"),
  volunteerLocation: (data) => call("/volunteers/location", "PUT", data),
  volunteerAlerts: () => call("/volunteers/alerts"),
  pushSubscription: (data) => call("/volunteers/push-subscription", "PUT", data),
  vapidPublicKey: () => call("/push/vapid-public-key"),
  incidents: () => call("/incidents"),
  teams: () => call("/teams"),
  sensors: () => call("/sensors"),
  report: (data) => call("/incidents", "POST", data),
  assign: (id, team_id) => call(`/incidents/${id}/assign`, "PATCH", { team_id }),
  setStatus: (id, status) => call(`/incidents/${id}/status`, "PATCH", { status }),
};