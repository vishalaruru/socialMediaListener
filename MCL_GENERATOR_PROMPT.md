# Model Context Literacy (MCL) — Generator Prompt

> **What is this?** A reusable prompt you paste into any AI coding agent to generate a `Model Context Literacy(MCL).md` file for any repository. The output file gives future AI agents instant, complete understanding of the codebase without scanning every file.

---

## How to Use

1. Open a new AI agent session in the target repository.
2. Copy the entire prompt below (everything inside the code fence).
3. Paste it as your first message.
4. The agent will scan the repo and produce a `Model Context Literacy(MCL).md` at the project root.

---

## The Prompt

````markdown
You are a senior software architect performing a first-time codebase audit. Your job is to produce a single file called `Model Context Literacy(MCL).md` at the root of this repository. This file will be read by AI coding agents on every future session to acquire instant, complete context about this codebase — eliminating the need to traverse files one by one.

---

## PHASE 1: DISCOVERY (Do this BEFORE writing anything)

Perform these steps silently. Do not output results yet — just gather facts:

1. **Classify the repo type.** Read the root directory. Identify which kind of project this is:
   - Web app / API / Mobile app / CLI / ML Pipeline
   - **Is this a Monorepo?** (Check for `lerna.json`, `turbo.json`, `pnpm-workspace.yaml`, or multiple `package.json` files). *If it is a large monorepo, do NOT attempt to document every internal package. Document the workspace boundaries, shared routing/gateways, and instruct future agents to run this prompt individually inside specific package subdirectories.*

2. **Read the dependency manifest FIRST.** (e.g., `package.json`, `pyproject.toml`, `go.mod`, `build.gradle`). Extract exact primary dependency names and major version numbers.

3. **Read configuration files.** Scan for framework configs, database schemas/ORMs, environment templates, and CI/CD pipelines.

4. **Trace the data lifecycle.** For every persistent data store you find:
   - Identify which files WRITE to it vs READ from it. Note the format (SQL, JSON, Redis, etc.).

5. **Trace one full user-facing request.** Client trigger → API route → business logic → data store → response.

6. **Hunt for quirks (The most important step).** Actively look for things that BREAK standard assumptions:
   - Is there a database schema defined but not actually used?
   - Are there hardcoded paths, magic strings, or environment-dependent behavior?
   - Are there features that are stubbed out or half-implemented?

7. **Identify Domain Terminology.** What are the unique business entities here? (e.g., Does "Workspace" mean a billing unit or a UI layout? What is the difference between an "Account" and a "User" in *this* repo?)

---

## PHASE 2: GENERATE THE FILE

Write `Model Context Literacy(MCL).md` at the project root using the structure below. Follow every rule precisely.

### Hard Rules:
- **Include the Stale Context Warning:** The very first line of the file MUST BE exactly this alert:
  `> [!WARNING]`
  `> **AI AGENTS:** This is a point-in-time snapshot. ALWAYS verify critical file paths, schemas, and dependencies against the live codebase before executing modifying code.`
- **Keep the file under 300 lines.** Brevity saves tokens. If you can say it in fewer words, do so.
- **Every claim must reference a specific file path.** Use markdown links: `[filename](file:///absolute/path/to/file)`.
- **Do NOT document boilerplate files** unless they contain project-specific non-standard rules.
- **Use tables over prose.** Tables are denser and faster to parse.

---

### Section 1: Repository Identity & Monorepo Status

Answer in 2-3 sentences: What does this system do? What is its deployment target? What is its current state (MVP, production, prototype)?
*If this is a monorepo, define the workspace structure here.*

---

### Section 2: Domain Terminology (Ubiquitous Language)

A markdown table defining 3-5 critical business terms unique to this repo. Prevent agents from confusing similar terms (e.g., "Customer" vs "Subscriber", "Post" vs "Message").

---

### Section 3: Technology Stack

A markdown table with columns: **Layer**, **Technology (with version)**, **Role in This Repo**.
Parse exact versions from the dependency manifest. Do not guess. Skip dev-only tooling unless unusual.

---

### Section 4: File Map & Ownership

A markdown table with columns: **File/Directory**, **Domain**, **Key Exports / Responsibilities**.
List only files containing business logic, data access, or API surface. Group by logical domain.

---

### Section 5: Data Architecture

For each data store (database, cache, flat file, external API), create a sub-section:
- **Format / Schema**: (e.g., SQLite table, JSON flat file)
- **Writers**: Which files/functions write to this store?
- **Readers**: Which files/functions read from this store?

---

### Section 6: Request Traces

Trace the 2-3 most important user-facing operations end-to-end. Use arrow notation:
`[Trigger] → [Handler] → [Business Logic] → [Data Store] → [Response] → [UI Update]`

---

### Section 7: Environment & Secrets

A markdown table: **Variable Name**, **Required?**, **Purpose**, **Where Used**.
List every environment variable the app reads. Reference the exact file and line where each is read.

---

### Section 8: Traps & Gotchas

List every non-obvious pattern that would cause an AI agent to write incorrect code. Format each as:

> **🪤 [Short Title]**
> [1-2 sentence explanation of what's surprising]
> **Impact**: What breaks if you get this wrong.
> **Evidence**: `[file](file:///path)` line X

*(Actively check for: Storage divergence, external service dependencies, dynamic path resolution quirks, and incomplete features).*

---

### Section 9: Testing & Verification

- **Test framework**: (Jest, Pytest, none, etc.)
- **How to run tests**: Exact command(s)
- **If no tests exist**: State this explicitly so agents know they must rely on manual validation.

---

### Section 10: Scripts & Commands

A markdown table: **Command**, **What It Does**, **When to Use**. Include common ad-hoc commands.

---

### Section 11: Dependency Graph (Architectural Boundaries)

**CRITICAL SCALING RULE:**
- If the repo has < 20 source files: Map exact file-to-file imports.
- If the repo has > 20 source files or is a monorepo: Do NOT map file-to-file. Map the **architectural flow** instead (e.g., `src/routes/` → `src/controllers/` → `src/services/` → `src/models/`).

Use arrow notation:
```
ModuleA → ModuleB, ModuleC
ModuleB → ModuleD
```
````
