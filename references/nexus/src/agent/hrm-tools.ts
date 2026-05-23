import type { AgentTool, ToolContext } from "./tools.js";
import {
  strapiGet,
  strapiPost,
  getJwt,
  formatResponse,
  buildFilters,
  paginate,
  qs,
} from "./hrm-helpers.js";

export function createHrmTools(baseUrl: string): AgentTool[] {
  // ── hrm_employees ──────────────────────────────────────────────
  const hrmEmployees: AgentTool = {
    name: "hrm_employees",
    description:
      "Query employee data. Actions: list (with filters), get (by documentId), search (by name/email/employeeId).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "get", "search"],
          description: "Action to perform",
        },
        documentId: {
          type: "string",
          description: "Employee documentId (for 'get')",
        },
        query: {
          type: "string",
          description: "Search query (for 'search')",
        },
        department: { type: "string", description: "Filter by department name" },
        status: { type: "string", description: "Filter by status (active, inactive, terminated)" },
        location: { type: "string", description: "Filter by location name" },
        employmentType: { type: "string", description: "Filter by employment type" },
        page: { type: "number", description: "Page number (default 1)" },
        pageSize: { type: "number", description: "Page size (default 25)" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "get") {
        const id = input.documentId as string;
        if (!id) return "Error: documentId is required for 'get' action";
        const endpoint = `/employees/${id}${qs("populate=department,position,location,manager")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "search") {
        const q = input.query as string;
        if (!q) return "Error: query is required for 'search' action";
        const filters = [
          `filters[$or][0][firstName][$containsi]=${encodeURIComponent(q)}`,
          `filters[$or][1][lastName][$containsi]=${encodeURIComponent(q)}`,
          `filters[$or][2][email][$containsi]=${encodeURIComponent(q)}`,
          `filters[$or][3][employeeId][$containsi]=${encodeURIComponent(q)}`,
        ].join("&");
        const endpoint = `/employees${qs(filters, paginate(input.page as number, input.pageSize as number), "populate=department,position")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      // list
      const filterParts: string[] = [];
      if (input.department) filterParts.push(`filters[department][name][$eq]=${encodeURIComponent(input.department as string)}`);
      if (input.status) filterParts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
      if (input.location) filterParts.push(`filters[location][name][$eq]=${encodeURIComponent(input.location as string)}`);
      if (input.employmentType) filterParts.push(`filters[employmentType][$eq]=${encodeURIComponent(input.employmentType as string)}`);

      const endpoint = `/employees${qs(filterParts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=department,position")}`;
      const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
      return formatResponse(res.data, res.ok, res.status);
    },
  };

  // ── hrm_leave ──────────────────────────────────────────────────
  const hrmLeave: AgentTool = {
    name: "hrm_leave",
    description:
      "Manage leave data. Actions: balances (employee leave balances), requests (list leave requests), request_create (submit new request), request_action (approve/reject).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["balances", "requests", "request_create", "request_action"],
          description: "Action to perform",
        },
        employeeId: { type: "string", description: "Employee documentId" },
        leaveTypeId: { type: "string", description: "Leave type documentId (for request_create)" },
        startDate: { type: "string", description: "Start date YYYY-MM-DD" },
        endDate: { type: "string", description: "End date YYYY-MM-DD" },
        reason: { type: "string", description: "Reason for leave" },
        isHalfDay: { type: "boolean", description: "Half day leave" },
        status: { type: "string", description: "Filter by status (pending, approved, rejected)" },
        requestId: { type: "string", description: "Leave request documentId (for request_action)" },
        requestAction: { type: "string", enum: ["approve", "reject"], description: "Approve or reject" },
        comments: { type: "string", description: "Action comments" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "balances") {
        const empId = input.employeeId as string;
        if (!empId) return "Error: employeeId is required";
        const endpoint = `/leave-balances${qs(`filters[employee][documentId][$eq]=${empId}`, "populate=leaveType")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "requests") {
        const parts: string[] = [];
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        if (input.employeeId) parts.push(`filters[employee][documentId][$eq]=${input.employeeId}`);
        if (input.startDate) parts.push(`filters[startDate][$gte]=${input.startDate}`);
        if (input.endDate) parts.push(`filters[endDate][$lte]=${input.endDate}`);
        const endpoint = `/leave-requests${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=employee,leaveType", "sort=createdAt:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "request_create") {
        if (!input.employeeId || !input.leaveTypeId || !input.startDate || !input.endDate)
          return "Error: employeeId, leaveTypeId, startDate, endDate are required";
        const body = {
          data: {
            employee: input.employeeId,
            leaveType: input.leaveTypeId,
            startDate: input.startDate,
            endDate: input.endDate,
            reason: input.reason ?? "",
            isHalfDay: input.isHalfDay ?? false,
            status: "pending",
          },
        };
        const res = await strapiPost(baseUrl, "/leave-requests", body, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "request_action") {
        if (!input.requestId || !input.requestAction) return "Error: requestId and requestAction are required";
        const body = {
          data: {
            status: input.requestAction === "approve" ? "approved" : "rejected",
            reviewComments: input.comments ?? "",
          },
        };
        const res = await strapiPost(baseUrl, `/leave-requests/${input.requestId}`, body, jwt, ctx.signal, "PUT");
        return formatResponse(res.data, res.ok, res.status);
      }

      return "Error: unknown action";
    },
  };

  // ── hrm_attendance ─────────────────────────────────────────────
  const hrmAttendance: AgentTool = {
    name: "hrm_attendance",
    description:
      "Manage attendance. Actions: records (list records), summary (monthly aggregated stats), clock_in, clock_out.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["records", "summary", "clock_in", "clock_out"],
          description: "Action to perform",
        },
        employeeId: { type: "string", description: "Employee documentId" },
        startDate: { type: "string", description: "Start date YYYY-MM-DD" },
        endDate: { type: "string", description: "End date YYYY-MM-DD" },
        month: { type: "string", description: "Month YYYY-MM (for summary)" },
        status: { type: "string", description: "Filter by status" },
        timestamp: { type: "string", description: "ISO timestamp for clock_in/clock_out" },
        note: { type: "string", description: "Note for clock_in/clock_out" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "records") {
        const parts: string[] = [];
        if (input.employeeId) parts.push(`filters[employee][documentId][$eq]=${input.employeeId}`);
        if (input.startDate) parts.push(`filters[date][$gte]=${input.startDate}`);
        if (input.endDate) parts.push(`filters[date][$lte]=${input.endDate}`);
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        const endpoint = `/attendance-records${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=employee", "sort=date:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "summary") {
        if (!input.employeeId || !input.month) return "Error: employeeId and month (YYYY-MM) are required";
        const [year, mo] = (input.month as string).split("-");
        const startDate = `${year}-${mo}-01`;
        const lastDay = new Date(Number(year), Number(mo), 0).getDate();
        const endDate = `${year}-${mo}-${String(lastDay).padStart(2, "0")}`;
        const endpoint = `/attendance-records${qs(
          `filters[employee][documentId][$eq]=${input.employeeId}`,
          `filters[date][$gte]=${startDate}`,
          `filters[date][$lte]=${endDate}`,
          "populate=employee",
          "pagination[pageSize]=100",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        if (!res.ok) return formatResponse(res.data, res.ok, res.status);

        // Aggregate
        const records = ((res.data as any)?.data ?? []) as any[];
        const summary = {
          month: input.month,
          employeeId: input.employeeId,
          totalRecords: records.length,
          presentDays: records.filter((r: any) => r.status === "present" || r.status === "late").length,
          absentDays: records.filter((r: any) => r.status === "absent").length,
          lateDays: records.filter((r: any) => r.status === "late").length,
          totalHours: records.reduce((sum: number, r: any) => sum + (r.hoursWorked ?? 0), 0),
        };
        return JSON.stringify(summary, null, 2);
      }

      if (action === "clock_in" || action === "clock_out") {
        if (!input.employeeId) return "Error: employeeId is required";
        const body = {
          data: {
            employee: input.employeeId,
            [action === "clock_in" ? "checkIn" : "checkOut"]: input.timestamp ?? new Date().toISOString(),
            date: ((input.timestamp as string) ?? new Date().toISOString()).slice(0, 10),
            note: input.note ?? "",
          },
        };
        if (action === "clock_in") {
          const res = await strapiPost(baseUrl, "/attendance-records", body, jwt, ctx.signal);
          return formatResponse(res.data, res.ok, res.status);
        }
        // clock_out: find today's record and update
        const today = ((input.timestamp as string) ?? new Date().toISOString()).slice(0, 10);
        const findEndpoint = `/attendance-records${qs(
          `filters[employee][documentId][$eq]=${input.employeeId}`,
          `filters[date][$eq]=${today}`,
          "sort=createdAt:desc",
          "pagination[pageSize]=1",
        )}`;
        const findRes = await strapiGet(baseUrl, findEndpoint, jwt, ctx.signal);
        const records = ((findRes.data as any)?.data ?? []) as any[];
        if (records.length === 0) return "Error: no clock-in record found for today";
        const recordId = records[0].documentId;
        const res = await strapiPost(baseUrl, `/attendance-records/${recordId}`, body, jwt, ctx.signal, "PUT");
        return formatResponse(res.data, res.ok, res.status);
      }

      return "Error: unknown action";
    },
  };

  // ── hrm_payroll ────────────────────────────────────────────────
  const hrmPayroll: AgentTool = {
    name: "hrm_payroll",
    description:
      "Query payroll data. Actions: runs (list payroll runs), payslip (employee payslip for a period), salary (current salary structure).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["runs", "payslip", "salary"],
          description: "Action to perform",
        },
        employeeId: { type: "string", description: "Employee documentId" },
        period: { type: "string", description: "Period YYYY-MM" },
        status: { type: "string", description: "Filter runs by status" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "runs") {
        const parts: string[] = [];
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        const endpoint = `/payroll-runs${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "sort=createdAt:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "payslip") {
        if (!input.employeeId || !input.period) return "Error: employeeId and period (YYYY-MM) are required";
        const endpoint = `/payslips${qs(
          `filters[employee][documentId][$eq]=${input.employeeId}`,
          `filters[period][$eq]=${input.period}`,
          "populate=employee,earnings,deductions",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "salary") {
        if (!input.employeeId) return "Error: employeeId is required";
        const endpoint = `/salary-structures${qs(
          `filters[employee][documentId][$eq]=${input.employeeId}`,
          "populate=components",
          "sort=effectiveDate:desc",
          "pagination[pageSize]=1",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      return "Error: unknown action";
    },
  };

  // ── hrm_recruitment ────────────────────────────────────────────
  const hrmRecruitment: AgentTool = {
    name: "hrm_recruitment",
    description:
      "Query recruitment data. Actions: postings (job postings), applications (for a posting), pipeline (stage summary with counts).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["postings", "applications", "pipeline"],
          description: "Action to perform",
        },
        postingId: { type: "string", description: "Job posting documentId" },
        status: { type: "string", description: "Filter by status" },
        department: { type: "string", description: "Filter postings by department" },
        stage: { type: "string", description: "Filter applications by stage" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "postings") {
        const parts: string[] = [];
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        if (input.department) parts.push(`filters[department][name][$eq]=${encodeURIComponent(input.department as string)}`);
        const endpoint = `/job-postings${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=department", "sort=createdAt:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "applications") {
        if (!input.postingId) return "Error: postingId is required";
        const parts: string[] = [`filters[jobPosting][documentId][$eq]=${input.postingId}`];
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        if (input.stage) parts.push(`filters[stage][$eq]=${encodeURIComponent(input.stage as string)}`);
        const endpoint = `/applications${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=candidate", "sort=createdAt:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "pipeline") {
        if (!input.postingId) return "Error: postingId is required";
        const endpoint = `/applications${qs(
          `filters[jobPosting][documentId][$eq]=${input.postingId}`,
          "pagination[pageSize]=100",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        if (!res.ok) return formatResponse(res.data, res.ok, res.status);
        const apps = ((res.data as any)?.data ?? []) as any[];
        const stages: Record<string, number> = {};
        for (const app of apps) {
          const stage = app.stage ?? "unknown";
          stages[stage] = (stages[stage] ?? 0) + 1;
        }
        return JSON.stringify({ postingId: input.postingId, pipeline: stages, total: apps.length }, null, 2);
      }

      return "Error: unknown action";
    },
  };

  // ── hrm_organization ───────────────────────────────────────────
  const hrmOrganization: AgentTool = {
    name: "hrm_organization",
    description:
      "Query org structure. Actions: departments (with headcount), positions (with salary bands), locations (with employee count), org_chart (hierarchical tree for a department).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["departments", "positions", "locations", "org_chart"],
          description: "Action to perform",
        },
        departmentId: { type: "string", description: "Department documentId (for org_chart)" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "departments") {
        const endpoint = `/departments${qs(paginate(input.page as number, input.pageSize as number), "populate=employees")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        if (!res.ok) return formatResponse(res.data, res.ok, res.status);
        // Add headcount
        const depts = ((res.data as any)?.data ?? []) as any[];
        const result = depts.map((d: any) => ({
          ...d,
          headcount: Array.isArray(d.employees) ? d.employees.length : 0,
          employees: undefined, // don't return full employee list
        }));
        return JSON.stringify({ data: result, meta: (res.data as any)?.meta }, null, 2);
      }

      if (action === "positions") {
        const endpoint = `/positions${qs(paginate(input.page as number, input.pageSize as number), "populate=department")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "locations") {
        const endpoint = `/locations${qs(paginate(input.page as number, input.pageSize as number), "populate=employees")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        if (!res.ok) return formatResponse(res.data, res.ok, res.status);
        const locs = ((res.data as any)?.data ?? []) as any[];
        const result = locs.map((l: any) => ({
          ...l,
          employeeCount: Array.isArray(l.employees) ? l.employees.length : 0,
          employees: undefined,
        }));
        return JSON.stringify({ data: result, meta: (res.data as any)?.meta }, null, 2);
      }

      if (action === "org_chart") {
        if (!input.departmentId) return "Error: departmentId is required";
        const endpoint = `/employees${qs(
          `filters[department][documentId][$eq]=${input.departmentId}`,
          "populate=position,manager",
          "pagination[pageSize]=100",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        if (!res.ok) return formatResponse(res.data, res.ok, res.status);
        const employees = ((res.data as any)?.data ?? []) as any[];
        // Build tree
        const byId = new Map<string, any>();
        for (const e of employees) {
          byId.set(e.documentId, { id: e.documentId, name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(), position: e.position?.name, children: [] });
        }
        const roots: any[] = [];
        for (const e of employees) {
          const node = byId.get(e.documentId)!;
          const managerId = e.manager?.documentId;
          if (managerId && byId.has(managerId)) {
            byId.get(managerId)!.children.push(node);
          } else {
            roots.push(node);
          }
        }
        return JSON.stringify(roots, null, 2);
      }

      return "Error: unknown action";
    },
  };

  // ── hrm_performance ────────────────────────────────────────────
  const hrmPerformance: AgentTool = {
    name: "hrm_performance",
    description:
      "Query performance data. Actions: cycles (review cycles), assessments (for a cycle, optionally by employee), goals (employee goals with progress).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["cycles", "assessments", "goals"],
          description: "Action to perform",
        },
        cycleId: { type: "string", description: "Review cycle documentId" },
        employeeId: { type: "string", description: "Employee documentId" },
        status: { type: "string", description: "Filter by status" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const jwt = getJwt(ctx);
      const action = input.action as string;

      if (action === "cycles") {
        const parts: string[] = [];
        if (input.status) parts.push(`filters[status][$eq]=${encodeURIComponent(input.status as string)}`);
        const endpoint = `/review-cycles${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "sort=createdAt:desc")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "assessments") {
        if (!input.cycleId) return "Error: cycleId is required";
        const parts: string[] = [`filters[reviewCycle][documentId][$eq]=${input.cycleId}`];
        if (input.employeeId) parts.push(`filters[employee][documentId][$eq]=${input.employeeId}`);
        const endpoint = `/assessments${qs(parts.join("&"), paginate(input.page as number, input.pageSize as number), "populate=employee,reviewer")}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      if (action === "goals") {
        if (!input.employeeId) return "Error: employeeId is required";
        const endpoint = `/goals${qs(
          `filters[employee][documentId][$eq]=${input.employeeId}`,
          paginate(input.page as number, input.pageSize as number),
          "sort=createdAt:desc",
        )}`;
        const res = await strapiGet(baseUrl, endpoint, jwt, ctx.signal);
        return formatResponse(res.data, res.ok, res.status);
      }

      return "Error: unknown action";
    },
  };

  return [hrmEmployees, hrmLeave, hrmAttendance, hrmPayroll, hrmRecruitment, hrmOrganization, hrmPerformance];
}
