import express from "express";
import path from "node:path";
import { config, requireCredentials } from "../config.js";
import {
  ApiError,
  CenterLogixClient,
  type DueMode,
  type ResponseCode,
  type TicketSearchRow,
} from "../api/client.js";

requireCredentials();

const app = express();
const client = new CenterLogixClient();

app.use(express.static(path.join(import.meta.dirname, "public")));

app.get("/app/config", (_req, res) => {
  res.json({ memberCode: config.memberCode });
});

/** Fisher-Yates shuffle, then take n. */
function sample<T>(items: T[], n: number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DUE_MODES: DueMode[] = ["late", "pending", "responded", "all"];

let codesCache: ResponseCode[] | null = null;

app.get("/app/codes", async (_req, res) => {
  try {
    codesCache ??= await client.getResponseCodes();
    res.json(codesCache.map(({ code, description }) => ({ code, description })));
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/app/search", async (req, res) => {
  try {
    const member = String(req.query.member ?? "").trim().toUpperCase();
    const start = String(req.query.start ?? "");
    const end = String(req.query.end ?? "");
    const sampleSize = Math.max(0, Number(req.query.sample ?? 0)); // 0 = all
    const codeFilter = String(req.query.code ?? "").trim();

    if (!member) return res.status(400).json({ error: "member code is required" });
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return res.status(400).json({ error: "start and end must be yyyy-mm-dd" });
    }
    if (start > end) return res.status(400).json({ error: "start date is after end date" });

    // Keyword search narrows server-side; member_codes filter makes the match exact.
    const rows = await client.searchTickets(start, end, member);
    const matched = rows.filter((r: TicketSearchRow) =>
      (r.member_codes ?? "")
        .toUpperCase()
        .split(/[\s,;]+/)
        .includes(member),
    );

    // Pull this member's responses for the window (responses trail ticket creation,
    // so extend the end out 45 days, capped at tomorrow) and join by ticket+revision.
    const respStart = new Date(`${start}T00:00:00`).toISOString();
    const respEnd = new Date(
      Math.min(
        new Date(`${end}T00:00:00`).getTime() + 46 * 86400_000,
        Date.now() + 86400_000,
      ),
    ).toISOString();
    const responses = await client.getMemberResponses(member, respStart, respEnd);
    const byTicket = new Map<string, { code: string; responded_at: string; responded_by: string; comments: string | null }[]>();
    for (const r of responses) {
      const key = `${r.ticket}|${r.revision}`;
      const list = byTicket.get(key) ?? [];
      list.push({
        code: r.code,
        responded_at: r.responded_at,
        responded_by: r.responded_by,
        comments: r.comments,
      });
      byTicket.set(key, list);
    }

    const enriched = matched.map((t) => ({
      ...t,
      my_responses: byTicket.get(`${t.ticket}|${t.revision}`) ?? [],
    }));

    const filtered = codeFilter
      ? enriched.filter((t) => t.my_responses.some((r) => r.code === codeFilter))
      : enriched;

    const picked =
      sampleSize > 0 && sampleSize < filtered.length
        ? sample(filtered, sampleSize)
        : filtered.slice();
    picked.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    res.json({
      keywordMatches: rows.length,
      matched: matched.length,
      codeFilter: codeFilter || null,
      filtered: filtered.length,
      sampled: picked.length,
      tickets: picked,
    });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/app/due", async (req, res) => {
  try {
    const member = String(req.query.member ?? "").trim().toUpperCase();
    const mode = String(req.query.mode ?? "late") as DueMode;
    if (!member) return res.status(400).json({ error: "member code is required" });
    if (!DUE_MODES.includes(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${DUE_MODES.join(", ")}` });
    }
    const rows = await client.getDueList(member, mode);
    rows.sort((a, b) => ((a.response_due_at ?? "") < (b.response_due_at ?? "") ? -1 : 1));
    res.json({ mode, count: rows.length, tickets: rows });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/app/ticket/:ticket", async (req, res) => {
  try {
    const ticket = req.params.ticket;
    const revision = String(req.query.revision ?? "");
    const [formatted, detail] = await Promise.allSettled([
      revision
        ? client.getFormattedTicket(ticket, revision)
        : Promise.reject(new Error("no revision")),
      client.getTicket(ticket),
    ]);
    res.json({
      formatted: formatted.status === "fulfilled" ? formatted.value : null,
      detail: detail.status === "fulfilled" ? detail.value : null,
    });
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res: express.Response, err: unknown): void {
  const status = err instanceof ApiError && err.status !== 401 ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}

app.listen(config.port, () => {
  console.log(`OUPS ticket sampler running at http://localhost:${config.port}`);
});
