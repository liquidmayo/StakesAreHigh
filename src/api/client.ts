import { config } from "../config.js";

/** One row from POST /api/ticket/search (see /api-docs). */
export interface TicketSearchRow {
  ticket_uuid: string;
  ticket: string;
  revision: string;
  created_at: string;
  type: string;
  category: string;
  priority: string;
  county: string;
  place: string;
  street: string;
  caller_name: string;
  caller_email: string;
  person_email: string;
  done_for: string;
  work_type: string;
  excavator_name: string;
  location: string;
  member_codes: string;
}

/** One row from GET /api/response. */
export interface MemberResponse {
  ticket: string;
  revision: string;
  code: string;
  comments: string | null;
  member_code: string;
  responded_at: string;
  responded_by: string;
}

/** One row from GET /api/response_code. */
export interface ResponseCode {
  code: string;
  description: string;
}

/** One row from GET /api/response/due/list. */
export interface DueRow {
  ticket: string;
  revision: string;
  type: string;
  category: string;
  priority: string;
  response_due_at: string;
  address: string;
  place: string;
  county: string;
  location: string;
  responsecode: string;
  whoresponded: string;
  whenresponded: string;
  responded_at: string | null;
  responded_by: string | null;
}

export type DueMode = "pending" | "all" | "late" | "responded";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Minimal CENTER LOGiX API client. Logs in with the member credentials from
 * .env and keeps the session cookie; re-authenticates once on a 401.
 */
export class CenterLogixClient {
  private cookie: string | null = null;
  private loginPromise: Promise<void> | null = null;

  private async login(): Promise<void> {
    const form = new FormData();
    form.set("center", config.center);
    form.set("email", config.email);
    form.set("password", config.password);

    const res = await fetch(`${config.baseUrl}/api/login`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(
        `Login failed (${res.status}): ${body || res.statusText}. Check OUPS_EMAIL/OUPS_PASSWORD in .env.`,
        res.status,
      );
    }
    const cookies = res.headers.getSetCookie();
    if (!cookies.length) {
      throw new ApiError("Login succeeded but no session cookie was returned.", 500);
    }
    this.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  }

  /** Serialize concurrent logins so parallel requests don't stampede the rate-limited endpoint. */
  private ensureLogin(): Promise<void> {
    if (this.cookie) return Promise.resolve();
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  private async request(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    await this.ensureLogin();
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie: this.cookie ?? "" },
    });
    if (res.status === 401 && !retried) {
      this.cookie = null;
      return this.request(path, init, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(`${path} failed (${res.status}): ${body || res.statusText}`, res.status);
    }
    return res;
  }

  /**
   * Search tickets created in [startDate, endDate] (dates inclusive, yyyy-mm-dd)
   * whose text matches the keyword query.
   */
  async searchTickets(startDate: string, endDate: string, q?: string): Promise<TicketSearchRow[]> {
    const form = new URLSearchParams();
    // Local midnight, sent as a full RFC3339 timestamp (the API rejects offset-less values).
    form.set("start_date", new Date(`${startDate}T00:00:00`).toISOString());
    // API treats end_date as exclusive; push it to the next day so endDate is included.
    const end = new Date(`${endDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    form.set("end_date", end.toISOString());
    if (q) form.set("q", q);

    const res = await this.request("/api/ticket/search", { method: "POST", body: form });
    return (await res.json()) as TicketSearchRow[];
  }

  /** Full ticket record(s) for a ticket number, newest revision first. */
  async getTicket(ticket: string): Promise<unknown[]> {
    const params = new URLSearchParams({
      ticket,
      include_dispatches: "true",
      include_responses: "true",
      include_verifies: "true",
      columns: "*",
      orderBy: "revision desc",
    });
    const res = await this.request(`/api/ticket?${params}`);
    return (await res.json()) as unknown[];
  }

  /** All response codes (001–009, 999) with their meanings. */
  async getResponseCodes(): Promise<ResponseCode[]> {
    const res = await this.request("/api/response_code?orderBy=code");
    return (await res.json()) as ResponseCode[];
  }

  /** Responses posted by a member code between two instants. */
  async getMemberResponses(
    memberCode: string,
    startIso: string,
    endIso: string,
  ): Promise<MemberResponse[]> {
    const params = new URLSearchParams({
      member_code: memberCode,
      created_at_start: startIso,
      created_at_end: endIso,
      orderBy: "created_at",
    });
    const res = await this.request(`/api/response?${params}`);
    return (await res.json()) as MemberResponse[];
  }

  /** Tickets on a member's response-due list. mode "late" = past due. */
  async getDueList(memberCode: string, mode: DueMode): Promise<DueRow[]> {
    const params = new URLSearchParams({ memberCode, mode });
    const res = await this.request(`/api/response/due/list?${params}`);
    return (await res.json()) as DueRow[];
  }

  /** Human-readable formatted ticket text, as delivered to members. */
  async getFormattedTicket(ticket: string, revision: string): Promise<string> {
    const res = await this.request(
      `/api/ticket/formatted/${encodeURIComponent(ticket)}/${encodeURIComponent(revision)}`,
    );
    return res.text();
  }
}
