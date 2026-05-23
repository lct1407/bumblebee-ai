# Nexus — Tools

## HRM SDK Tools

High-level tools for HR data. Each handles pagination, relation population, and sensitive field masking automatically.

### hrm_employees
Query employee data.
- **list**: filters (department, status, location, employmentType), page, pageSize
- **get**: documentId → full profile with department, position, location, manager
- **search**: query string → searches name/email/employeeId

### hrm_leave
Manage leave data.
- **balances**: employeeId → all leave type balances
- **requests**: filters (status, employee, dateRange), page
- **request_create**: employeeId, leaveTypeId, startDate, endDate, reason, isHalfDay
- **request_action**: requestId, approve/reject, comments

### hrm_attendance
Manage attendance.
- **records**: employeeId, dateRange, status filter
- **summary**: employeeId + month (YYYY-MM) → aggregated stats (present, late, absent, hours)
- **clock_in** / **clock_out**: employeeId, timestamp, note

### hrm_payroll
Query payroll data.
- **runs**: list payroll runs (status filter)
- **payslip**: employeeId + period (YYYY-MM) → earnings/deductions breakdown
- **salary**: employeeId → current salary structure

### hrm_recruitment
Query recruitment data.
- **postings**: filters (status, department), page
- **applications**: postingId, filters (status, stage)
- **pipeline**: postingId → stage summary with counts

### hrm_organization
Query org structure.
- **departments**: list with headcount
- **positions**: list with salary bands
- **locations**: list with employee count
- **org_chart**: departmentId → hierarchical tree

### hrm_performance
Query performance data.
- **cycles**: list review cycles (status filter)
- **assessments**: cycleId + optional employeeId
- **goals**: employeeId → current goals with progress

### strapi_api
Raw Strapi REST API fallback for anything not covered by the SDK tools above.
- Use standard Strapi query patterns: filters, populate, sort, pagination
- `GET /endpoint?filters[field][$eq]=value&populate=relation`
- `POST /endpoint` with body `{ "data": { ... } }`

### chart_generate
Generate charts as PNG images from Chart.js config.
- Supported types: bar, line, pie, doughnut, radar, polarArea, scatter, bubble
- Always set a chart title via options.plugins.title
- Pattern: query data → process with code_run if needed → chart_generate → share image URL

### code_run
Execute Python or JavaScript code for data analysis.
- Read data from stdin: `import json, sys; data = json.load(sys.stdin)`
- 30s timeout, standard library only, no network access
- Use for aggregation, CSV export, date calculations, statistics

### memory_update
Manage persistent user memories across conversations.
- **list**: Show all stored memories for the current user
- **add**: content + category (preference/context/correction) → save a new memory
- **remove**: memoryId → delete a specific memory

### bash
Execute shell commands (120s timeout).

### file_read / file_write
Read/write files. Always read before overwriting.

### web_fetch
Fetch URL content (truncated to 50,000 chars).
