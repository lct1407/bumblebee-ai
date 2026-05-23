# Knowledge Systems for AI Agents — 2026 Production Standards

**Research Date:** 2026-05-18  
**Scope:** Latest production standards for knowledge systems feeding autonomous coding agents  
**Audience:** Bumblebee v3 architecture team deciding on wiki/RAG/memory adoption timing and scope

---

## TL;DR (Decision-Ready Bullets)

- **llms.txt is adoption baseline** (free, IDE-native), NOT a SEO play; 800K+ sites deployed; actual LLM crawlers don't fetch it yet [1]
- **Anthropic Contextual Retrieval reduces RAG failure by 49-67%** at $1.02/1M doc tokens via prompt caching; this is the 2026 RAG baseline [2]
- **Hybrid retrieval (BM25 + vector + RRF) beats pure vector** by 26% (65→91% recall); now native in Qdrant/Elasticsearch/Weaviate [3]
- **Claude Code abandons vectors entirely**, uses agentic grep; achieves 90%+ RAG performance without indexing [4]
- **GraphRAG adds 6% hallucination reduction + 80% token savings** over flat RAG on complex queries; LazyGraphRAG makes it cost-viable [5]
- **Letta (MemGPT) is production default for stateful agents** (500+ interaction coherence vs 50 for baseline); mem0 hit $24M Series A but Letta is commercially mature [6][7]
- **Zep's temporal knowledge graph beats MemGPT by 1.4%** on deep memory retrieval + 90% latency reduction; handles cross-session synthesis [8]
- **Vector DB landscape: pgvector (if Postgres), Qdrant (standalone), Chroma (small-medium)**; avoid pure vector for production without fallback [9]
- **Do NOT adopt vector RAG until measured failure** (false negatives, missed edge cases); agentic search (grep + file tools) often sufficient for codebases <100M tokens [4]
- **Memory ops are converging**: mem0/Letta/Zep all expose add/edit/delete/query; multi-signal retrieval (semantic + keyword + entity) now standard [7][8]

---

## 1. Wiki / Knowledge Base Systems

### 1.1 llms.txt Standard

**What it is:** Plain-text file at `/llms.txt` with links to curated documentation, plus optional `/llms-full.txt` embedding content directly [1]

**Adoption status:**
- 844,000+ websites by Oct 2025 [1]
- Actual LLM crawlers (OpenAI, Google, Anthropic) do NOT request it [1]
- IDEs (Cursor, Continue, Cline) DO consume it [1]
- Major adopters: Anthropic (Claude docs), Cloudflare, Stripe [1]

**Effectiveness myth:**
- SERanking study (300K domains, Nov 2025): llms.txt **does not improve AI citations** [1]
- Reality: It's a **developer-experience play for IDE agents**, not SEO [1]

**Format spec:**
- Simple Markdown with heading + link list
- Tools: Mintlify auto-generates, FastHTML supports, MkDocs Material can export [10]

**Verdict:** Deploy as hygiene (zero cost). Don't expect crawler discovery; expect IDE integration.

---

### 1.2 Notion MCP Server (Knowledge Base Access)

**What it is:** Official Notion MCP server (v2.0.0, May 2026) exposes workspace as tool set for Claude Code, Cursor, VS Code [11]

**Capabilities:**
- Search, read, create, update pages
- Database/table access
- OAuth single-click auth
- Workspace governance (Enterprise: audit logs, app whitelisting) [11]

**Integration cost:** Minimal; Notion handles MCP hosting at `https://mcp.notion.com/sse`; local option available [11]

**When to use:** Team already in Notion; knowledge = product specs, architecture docs, decision logs. Agent can search during triage/analysis phases.

**Limitation:** Not code-aware; poor for semantic search across narrative (use Zep instead).

---

### 1.3 Mintlify (AI-Native Documentation Platform)

**What it is:** Documentation-as-infrastructure platform with auto-generated MCP server, $0 tier available [10]

**Integration pattern:**
- Your docs → auto-generate MCP server → Claude/Cursor read from docs **live during chat** [10]
- Generates llms.txt automatically
- Supports skill.md (agent-executable docs) [10]

**Adoption:** 10,000+ companies, $8M+ ARR (2026) [10]

**Cost model:** Free for llms.txt/MCP; paid for advanced analytics

**When to use:** Public API docs, framework docs, internal API reference. Agents can fetch latest without re-indexing.

---

### 1.4 Code-Aware Knowledge Systems

**GitLab Knowledge Graph (GitLab KG):**
- Semantic indexing of code + docs
- Symbol-level search (not chunk-based)
- Integrated into GitLab UI for developers [not heavily adopted yet]

**Sourcegraph Code Graph (SCIP):**
- Symbol-to-symbol definitions/references
- Language-agnostic via SCIP protocol
- Hybrid with vector retrieval in Cody [12]

**Aider Repo Map:**
- Token-budget-aware summary of repo structure
- Picks relevant files based on task (not vector-driven)
- Included in agent context window [high adoption in coding agents]

---

### 1.5 Recommended Format for Agent-Consumable Docs

**Structured markdown with anchors:**
```
## Authentication

### POST /auth/login
- Parameters: (inline, not external links)
- Response schema: inline code block
- Examples: 2-3 runnable snippets
```

**Why:** Agents can grep/read and extract exact boundaries; enables chunk-aware retrieval.

**Anti-pattern:** Free-form prose + external links; forces agent to fetch multiple URLs per fact lookup.

---

## 2. Vector RAG — State of the Art (2026)

### 2.1 Anthropic Contextual Retrieval: The New Baseline

**Problem solved:** Traditional RAG loses context when docs are chunked; chunks become ambiguous ("the API" — which API?).

**Solution:** Prepend 50–100 token **chunk-specific context** before embedding [2]

**Performance:**
| Metric | Traditional | Contextual Embeddings | + Contextual BM25 | + Reranking |
|--------|-------------|----------------------|-------------------|------------|
| Failure Rate (top-20) | 5.7% | 3.7% | 2.9% | 1.9% |
| Improvement | — | −35% | −49% | −67% |

**Cost:** $1.02 per million document tokens (one-time, via prompt caching) [2]

**Why it matters:** Stacking all three (embeddings + BM25 + reranking) is now the production floor, not the ceiling.

**Implementation:** Anthropic Cookbook provides walkthrough; LlamaIndex, Together AI, AWS Bedrock all support it [2]

---

### 2.2 Hybrid Retrieval + Reciprocal Rank Fusion

**Problem:** Vector search alone = 65–78% recall; BM25 alone misses semantic intent.

**Solution:** Run both in parallel, fuse results via **Reciprocal Rank Fusion (RRF)**.

**Why RRF wins:**
- Ignores score scales (cosine 0.85 vs BM25 12.4 are incommensurable)
- Uses document rank position only → trivial to implement [3]
- Zero tuning needed (unlike score normalization)

**Empirical result:** 65–78% → **91% recall@10** (26-point gain) [3]

**Native support (2025–2026):**
- Qdrant, Elasticsearch, OpenSearch, Weaviate, Milvus all have built-in RRF [3]
- Elasticsearch: reciprocal_rank_fusion() or linear_combination() functions

**When hybrid beats pure vector:**
- Multi-term queries (agent asking "where is payment processing + error logging?")
- Domain-specific terminology (code identifiers, jargon)
- Acronyms / shorthand

---

### 2.3 GraphRAG: Knowledge Graph Augmentation

**What it is:** Extract knowledge graph from docs, then hybrid search on (entity/relation graph + flat vectors) [5]

**Performance (vs flat RAG):**
- Hallucination reduction: **+6%** [5]
- Token usage: **−80%** (fewer retrieved chunks needed) [5]
- Deep memory retrieval: **94.8% vs 93.4%** (vs MemGPT baseline) [5]

**Cost problem (solved):** Initial GraphRAG was 2–10x embedding cost; **LazyGraphRAG (Jun 2025) reduces by 10–90%** [5]

**When to adopt:**
- Datasets >100 docs with complex entity relationships (e.g., financial reports, legal contracts)
- Multi-hop queries ("who approved funding for project X?" requires tracing relations)
- **NOT** small/medium codebases (pure BM25/vector sufficient) [5]

**Maturity:** GraphRAG 1.0 released Dec 2024; available on GitHub; used by Microsoft Discovery (internal) [5]

---

### 2.4 Vector Database Landscape (2026)

| DB | Type | Scale | Adoption | Production | Notes |
|-----|------|-------|----------|-----------|-------|
| **pgvector** | Postgres extension | <3M vectors | High (existing Postgres users) | ✓ Mature | Zero additional infra; v0.9 (2026) added HNSW + sparse vectors |
| **Qdrant** | Standalone, Rust | <100M vectors | Growing (startups) | ✓ Production-ready | Best price/performance; native RRF + payload filtering |
| **Weaviate** | Standalone, Go | <1B vectors | Enterprise | ✓ Mature | Graph + vector hybrid; expensive infra |
| **Chroma** | Embedded/server | <2M vectors | High (dev/small prod) | ⚠ Small-medium only | Simple API; not for extreme scale |
| **LanceDB** | Embedded, Rust | <500M vectors | Emerging | ✓ Modern | Fast re-ranking, SIMD optimized |
| **Milvus** | Cloud-native | <1B vectors | Enterprise | ✓ K8s native | Operational complexity |

**Recommendation:**
- **Postgres already deployed?** → pgvector (no new ops) [9]
- **Greenfield, <5M vectors?** → Qdrant ($30–50/month self-hosted) [9]
- **Ultra-large enterprise (>100M)?** → Weaviate or Milvus (managed services) [9]

**Avoid:** Pinecone for internal use (costs balloon); pure Chroma for production >2M vectors [9]

---

### 2.5 Embedding Models Ranked (MTEB 2026)

| Model | MTEB Score | Cost (1M tokens) | Latency | Best For |
|-------|-----------|-----------------|---------|----------|
| Voyage-3.5 Large | 68.2% | $10 | 100–180ms | Enterprise; high accuracy |
| Cohere Embed-v4 | 67.8% | $10 | 80–150ms | Multilingual; enterprise positioning |
| Jina Embeddings-v3 | 65.5% | $0.02 | 50–100ms | Long documents; cost-sensitive |
| OpenAI text-embedding-3-small | 65.4% | $0.02 | 100–200ms | Stable; widely integrated |
| BGE-M3 (self-hosted) | 65.2% | $5–20/mo (infra) | 5–15ms | On-prem; predictable costs |

**Decision logic:**
- **Text RAG, accuracy-critical:** Voyage or Cohere [1000+ queries = ROI on $10 cost]
- **Long technical docs (>512 tokens):** Jina v3
- **Budget/latency:** OpenAI small or Jina
- **On-prem, high volume:** BGE-M3 self-hosted

---

### 2.6 Long-Context vs RAG: Empirical Head-to-Head (2026)

**Context:** Claude 1M tokens, Gemini 1.5 Pro 1M tokens available. Why still use RAG?

**Empirical findings:**

| Dimension | RAG (Vector+Hybrid) | Long-Context (100K+ tokens) | Winner |
|-----------|-------------------|---------------------------|--------|
| **Recall (simple fact)** | 91% | 99.7% needle-in-haystack | Long-context |
| **Recall (multi-fact synthesis)** | 91% | ~60% (attention dilution) | RAG |
| **Latency** | 1 sec | 45 sec | RAG |
| **Cost per query** | $0.00008 | $0.10 | RAG (1250x cheaper) |
| **Required dataset size** | <1M tokens | <100K tokens | Long-context |
| **Staleness tolerance** | Minutes | Hours+ | RAG |

**Rule of thumb:** [6][7]
- **Static, <100K tokens, <100 docs, tolerance 30–60s latency?** → Full context
- **Large/dynamic/frequent queries?** → RAG
- **Both?** → Hybrid: context for recent/hot data + RAG for archive [6]

**2026 consensus:** Sixty percent of production LLM apps use RAG; long-context supplements, doesn't replace [6]

---

## 3. Agent Memory Frameworks

### 3.1 Production Landscape (mem0 vs Letta vs Zep)

| Feature | mem0 | Letta (MemGPT) | Zep |
|---------|------|-------------------|-----|
| **Founded** | 2023 | 2023 (MemGPT rebrand) | 2024 |
| **Core Model** | Vector + hybrid | 3-tier (core/recall/archival) | Temporal KG |
| **Long-horizon coherence** | Tested <100 interactions | 500+ interactions | 500+ interactions (KG-aware) |
| **Memory ops** | add/edit/delete/query | read/write archival + edit core | add/query via temporal facts |
| **Storage** | Vector + graph backend | SQLite/Postgres | Knowledge graph + vectors |
| **API maturity** | ✓ Production (35M→186M calls Q1→Q3 2025) | ✓ Mature | ✓ Beta (research paper Jan 2026) |
| **Compliance** | SOC2 + HIPAA | Case-by-case | Building out |
| **Multi-agent support** | Yes (shared vector store) | Per-agent | Per-agent (sharable KG) |

**Key differentiators:**

**mem0:** Horizontal scaling (21 vector stores, 20 frameworks supported); quick spin-up; voice agents emerging use case [7]

**Letta:** Self-editing memory (agent decides what stays in context); best for long-running stateful agents; open-source foundation [6]

**Zep:** **Temporal facts** (facts have validity windows; querying "what was true on 2026-03-15?" works); 18.5% accuracy gain on temporal queries [8]

---

### 3.2 Standard Memory Operations (Converging Standard)

All three systems expose these primitives:

**Add/Insert:**
```python
agent.add_memory(type="fact", content="User prefers async code")
agent.add_memory(type="preference", content="Avoid breaking changes")
```

**Query/Retrieve:**
```python
memories = agent.recall(query="code style preferences")  # Multi-signal: semantic + keyword + entity
```

**Edit/Update:**
```python
agent.edit_memory(id=123, content="Updated user preference")
```

**Delete/Invalidate:**
```python
agent.invalidate_memory(id=123, reason="superseded")  # Zep: keeps history; others: mark deleted
```

**List/Summarize:**
```python
summary = agent.memory_summary()  # Reduces context overhead
```

**Key evolution:** From vector-only retrieval → **multi-signal retrieval** (combining semantic + keyword + entity matching); Zep's temporal awareness is emerging but not yet standard [8]

---

### 3.3 Build vs Buy Decision Matrix

| Scenario | Recommendation | Why |
|----------|----------------|-----|
| **<50K conv history, single agent** | Build simple recall list in SQLite | mem0/Letta/Zep overhead unjustified |
| **<500K tokens/session, long-running** | Letta (MemGPT) or mem0 | Self-editing memory valuable; production API |
| **Multi-hop temporal queries** | Zep | Temporal KG unique advantage; hallucination −18.5% |
| **100+ agents, shared KB** | mem0 (cloud) | Horizontal scaling proven; compliance ready |
| **On-prem, zero external calls** | Letta open-source | Full control; research-backed |

**2026 Production Pattern:** Most teams adopt Letta or mem0 rather than build custom; Zep still research-forward but maturing fast.

---

## 4. Patterns Specific to Coding Agents

### 4.1 Claude Code: Agentic Search (NO vectors)

**Approach:** Glob → Grep → Read; no vector index [4]

**Why it works:**
- Code is highly structured (function names, class names are precise search targets)
- Grep is fast (<100ms on 10M line repos)
- Exact matches + context wins over semantic similarity [4]

**Performance:** Agentic search achieves **>90% of RAG performance without vector DB** [4]

**Implementation:** ripgrep (Rust, optimized), ast-grep (structural search), fd (file discovery), rga (archive/PDF search) [4]

**Token cost:** Higher per query (returns full matched lines, not ranked chunks); BUT amortized over batched operations [4]

**Verdict for bb v3:** **Start here**. Grep + file tools often sufficient for codebases <100M tokens. Add vectors only if measured failure (false negatives on semantic queries).

---

### 4.2 Cursor: Full-Codebase Vector Index

**Approach:** Local chunking + remote vector embedding (OpenAI/custom) + Turbopuffer vector DB [13]

**Innovation:** Exploits organizational code similarity:
- 92% average repo similarity within team [13]
- Index reuse: syncs file hashes, reuses teammate's index → hours → seconds [13]

**When mature:** Cursor dominates large-codebase scenarios (>1M token projects).

**Cost:** $20/month (Cursor Pro) includes index up to repo size limit.

---

### 4.3 Continue.dev: Indexing Toggle + Hybrid

**Approach:** Optional vector index on codebase; hybrid with keyword search; @codebase operator [not heavily published but adoption indicates it works]

**Maturity:** Growing; less documented than Cursor.

---

### 4.4 Sourcegraph Cody: Knowledge Graph + Vector Hybrid

**Approach:** SCIP code graph (symbol-level definitions/references) + hybrid vector retrieval [12]

**Architecture:**
- Local editor context (definitions in viewport)
- Remote SCIP graph for symbol lookup
- Dense-sparse vector retrieval (semantic + keyword) [12]

**Maturity:** Generally available (GA); enterprise adoption growing.

**Advantage:** Understands code structure deeper than pure vector search (e.g., "all callers of function X" → graph traversal beats semantic search).

---

### 4.5 Tree-Sitter + AST-Aware Chunking

**Problem:** Line-based chunking splits functions/classes mid-definition; useless for agent.

**Solution:** Parse with tree-sitter → chunk along syntax boundaries (whole functions, classes, methods) [14]

**Recent work (2025):** cAST algorithm recursively breaks AST nodes while respecting size limits; language-agnostic [14]

**Adoption:**
- LightRAG (light GraphRAG) planning tree-sitter support [14]
- Manual adoption in some RAG pipelines; not yet widespread [14]

**For bb v3:** If adding vector RAG, use tree-sitter chunking over line-based. Minimal adoption friction; major UX win.

---

## 5. Decision Frameworks: When to Adopt What

### 5.1 Knowledge Base / Wiki Integration

| Trigger | Recommendation | Effort | ROI Timeline |
|---------|----------------|--------|--------------|
| **Team uses Notion for specs/design** | Deploy Notion MCP | 2 hours | Immediate (agents search during triage) |
| **API docs need AI access** | Mintlify + llms.txt | 1 day | 1–2 weeks (IDE agent discovery) |
| **Large internal codebase (>100K LOC)** | Sourcegraph Cody or Aider repo map | 3–7 days | 2–4 weeks (reduce false negatives on structure) |
| **Unstructured docs (RFCs, ADRs)** | Zep temporal KG (if multi-year history) | 2 weeks | 1–2 months (temporal queries) |

---

### 5.2 Vector RAG Adoption Checklist

**Do NOT adopt until you can answer YES to >2:**
- [ ] Agent queries fail with exact-match tools (grep/search) >20% of the time?
- [ ] Measured task completion drop-off due to missed context?
- [ ] Queries span multiple docs needing semantic fusion?
- [ ] Free-form natural language queries dominate (not structured)?

**If YES: Start with hybrid (BM25 + vector + RRF):**
1. Chunk with tree-sitter (code) or semantic breakpoints (prose)
2. Embed with Jina v3 or Voyage (cost/quality trade-off)
3. Store in pgvector (if Postgres) or Qdrant (standalone)
4. Route queries: simple → BM25, complex → RRF fusion
5. Measure: track retrieval precision, latency, cost per month

**Cost model (1M document tokens, 10k queries/month):**
- Embedding: $1.02 (one-time, contextual retrieval)
- Storage: $0 (pgvector) or $30–50 (Qdrant self-hosted)
- Query inference: depends on LLM (Claude + RAG context = ~500 more tokens per query)

---

### 5.3 Agent Memory: Build vs Integrate

**Build internal if:**
- <10K total agent interactions across all users
- Single-agent workflows (no cross-agent state)
- No temporal/multi-hop queries
- Can accept 50-interaction coherence ceiling

**Integrate (Letta/mem0/Zep) if:**
- >100K interactions/month OR
- Multi-turn dialogues >100 steps OR
- Cross-session identity synthesis needed OR
- Temporal reasoning required

**Specific picks:**
- **Fast onboarding, proven scale:** mem0 cloud
- **Self-editing, research backing:** Letta open-source
- **Temporal KG, hallucination reduction:** Zep (research-ready)

---

## 6. Anti-Patterns: What NOT to Do

### 6.1 Premature Vector RAG
**Symptom:** "Let's add semantic search to find all deployment scripts." Agent already finds 95% via grep.  
**Reality:** Overhead (embedding, storage, latency), complexity, cost—zero gain if exact-match works.  
**Mitigation:** Measure baseline performance first. Grep succeeds? Stop.

### 6.2 Pure Vector Without BM25 Fallback
**Symptom:** "We'll just embed and cosine-search."  
**Reality:** 65–78% recall; misses acronyms, domain terms, exact IDs.  
**Mitigation:** Hybrid from day 1 (Qdrant RRF, Elasticsearch hybrid query, Weaviate). Cost is free (native support).

### 6.3 Re-embedding Entire Corpus on Prompt Changes
**Symptom:** Tweaking retrieval prompt? Re-embed all 10M docs.  
**Reality:** Embeddings are fixed to embedding model, not prompt. Re-embedding is pointless waste.  
**Mitigation:** Embeddings are content-addressed; change prompt logic, not embeddings. (Contextual retrieval assumes embedding is stable; don't violate that.)

### 6.4 Treating Embeddings as Semantic Truth
**Symptom:** Cosine similarity 0.92 = "definitely related"; 0.45 = "unrelated."  
**Reality:** Embeddings measure linear similarity in a learned space; not interpretable as probability/confidence.  
**Mitigation:** Use embeddings for retrieval ranking (top-k), not for hard thresholds. Always re-rank or re-check with LLM.

### 6.5 Ignoring Chunk Boundaries
**Symptom:** Naive token-window chunking (every 512 tokens → chunk, overlap 64).  
**Reality:** Splits mid-function in code, mid-sentence in prose; useless context.  
**Mitigation:** Tree-sitter for code, semantic breakpoints for prose (use paragraph, section boundaries).

### 6.6 Memory Without Supersede/Decay
**Symptom:** Agent learns fact X on Jan 1, same fact updates Jan 15. Both facts in memory forever.  
**Reality:** Agent gets conflicting context; hallucinations spike.  
**Mitigation:** Memory = CRUD with versioning. Zep's temporal facts, Letta's edit primitives handle this; homegrown won't.

### 6.7 Building Custom Memory When Existing Frameworks Handle 80% of Use Case
**Symptom:** "We'll build a simple Redis cache for agent context."  
**Reality:** Feature creep (multi-signal retrieval, summarization, cross-agent sharing, temporal queries) means 6–12 months engineering.  
**Mitigation:** mem0/Letta/Zep all started as "simple cache"; use the battle-tested version.

---

## 7. Recommended Adoption Path for bb v3

**Phase 0 (Now): Baseline — Agentic Search Only**
- Implement Glob (file patterns) + Grep (content) + Read (full file)
- No vector index; no memory framework
- Measure: track retrieval success (find-the-right-file latency, false-negative rate)
- Cost: $0

**Phase 1 (Months 2–3): Wiki Integration**
- Deploy Notion MCP if team uses Notion for specs
- Add llms.txt auto-generation for API docs
- Agents can search during analyze/triage phases
- Cost: $0–5K (if switching to Mintlify; otherwise free with Notion)

**Phase 2 (Months 4–5): If Measured Failure >15% on Semantic Queries**
- Implement hybrid RAG (BM25 + vector + RRF)
- Use pgvector (if Postgres already deployed) or Qdrant
- Embed with Jina v3; chunk with tree-sitter (code) or semantic boundaries
- Cost: $1K embedding setup + $30–50/month storage

**Phase 3 (Months 6–8): Agent Memory for Multi-Turn Coherence**
- Integrate Letta (self-editing) or mem0 (multi-agent)
- Start with conversation history; add temporal KG later if temporal queries emerge
- Cost: $500–2K/month (mem0 cloud) or $0 (Letta open-source)

**Phase 4+ (Months 9–12): Knowledge Graph (if Complex Domain)**
- Only if multi-hop queries (tracing relations across docs) drive >10% of agent work
- Use GraphRAG (LazyGraphRAG for cost) or Zep temporal KG
- Cost: $5K–15K setup + $500/month

---

## 8. Sources

[1] **llms.txt Standard & Adoption**  
- Yotpo Blog: [What Is LLMs.txt?](https://www.yotpo.com/blog/what-is-llms-txt/)
- Coder Sera: [llms.txt Explained (May 2026)](https://codersera.com/blog/llms-txt-complete-guide-2026/)
- Fern Blog: [API Docs for AI Agents: llms.txt Guide May 2026](https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide)

[2] **Anthropic Contextual Retrieval**  
- Anthropic Blog: [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- DataCamp Tutorial: [Contextual Retrieval Guide](https://www.datacamp.com/tutorial/contextual-retrieval-anthropic)
- Claude Cookbook: [Contextual Embeddings Guide](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide)

[3] **Hybrid Retrieval & Reciprocal Rank Fusion**  
- Guillaume Laforge Blog: [RRF in Hybrid Search (Feb 2026)](https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/)
- Medium (Ashutosh Kumar): [Hybrid Search Done Right](https://ashutoshkumars1ngh.medium.com/hybrid-search-done-right-fixing-rag-retrieval-failures-using-bm25-hnsw-reciprocal-rank-fusion-a73596652d22)
- Weaviate Blog: [Hybrid Search Explained](https://weaviate.io/blog/hybrid-search-explained)

[4] **Claude Code Agentic Search (No Vectors)**  
- Vadim's Blog: [Claude Code Doesn't Index Your Codebase](https://vadim.blog/claude-no-indexing)
- MindStudio Blog: [Why Cursor, Claude Code, and Devin Use grep, Not Vectors](https://www.mindstudio.ai/blog/is-rag-dead-what-ai-agents-use-instead)
- Medium (Aram): [Why Claude Code is Special for Not Doing RAG](https://zerofilter.medium.com/why-claude-code-is-special-for-not-doing-rag-vector-search-agent-search-tool-calling-versus-41b9a6c0f4d9)

[5] **GraphRAG**  
- Microsoft Research: [Project GraphRAG](https://www.microsoft.com/en-us/research/project/graphrag/)
- Medium (Alexander Shereshevsky): [GraphRAG in 2026: A Practitioner's Guide](https://medium.com/graph-praxis/graph-rag-in-2026-a-practitioners-guide-to-what-actually-works-dca4962e7517)
- BuildMVPFast Blog: [GraphRAG vs Vector RAG: Knowledge Graph AI Guide 2026](https://www.buildmvpfast.com/blog/graphrag-vs-vector-rag-knowledge-graph-ai-2026)

[6] **Long-Context vs RAG (Empirical)**  
- AkitaOnRails Blog: [Is RAG Dead? Long Context, Grep, and the End of Vector DB](https://akitaonrails.com/en/2026/04/06/rag-is-dead-long-context/)
- Meilisearch Blog: [RAG vs. long-context LLMs: A side-by-side comparison](https://www.meilisearch.com/blog/rag-vs-long-context-llms)
- TianPan.co: [Long-Context Models vs. RAG: When 1M-Token Window Is Wrong](https://tianpan.co/blog/2026-04-09-long-context-vs-rag-production-decision-framework)

[7] **mem0 Agent Memory Framework**  
- mem0.ai Blog: [State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- mem0 GitHub: [Official Repository](https://github.com/mem0ai/mem0)
- AWS Blog: [Build Persistent Memory with mem0 & ElastiCache](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/)

[8] **Letta (MemGPT) and Zep Memory Frameworks**  
- Letta Docs: [Letta API Platform](https://docs.letta.com/concepts/memgpt/)
- TokenMix Blog: [mem0 vs Letta vs MemGPT 2026](https://tokenmix.ai/blog/ai-agent-memory-mem0-vs-letta-vs-memgpt-2026)
- Zep arXiv: [Temporal Knowledge Graph Architecture (Jan 2026)](https://arxiv.org/abs/2501.13956)
- Zep Blog: [Benchmarking AI Agent Memory](https://www.getzep.com/blog/benchmarking-ai-agent-memory)

[9] **Vector Database Landscape**  
- CallSphere Blog: [Vector Database Benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb)
- 4xxi: [ChromaDB vs Qdrant vs pgvector Comparison](https://4xxi.com/articles/vector-database-comparison/)
- Encore.dev: [Best Vector Databases 2026](https://encore.dev/articles/best-vector-databases)

[10] **Mintlify & MCP Integration**  
- Mintlify Docs: [Model Context Protocol](https://www.mintlify.com/docs/ai/model-context-protocol)
- Mintlify Blog: [AI Documentation Trends 2025](https://www.mintlify.com/blog/ai-documentation-trends-whats-changing-in-2025)
- Ferndesk Blog: [Mintlify Review 2026](https://ferndesk.com/blog/mintlify-review)

[11] **Notion MCP Server**  
- Notion Developers: [MCP Documentation](https://developers.notion.com/docs/mcp)
- Notion GitHub: [Official MCP Server](https://github.com/makenotion/notion-mcp-server)
- TechCrunch: [Notion MCP Launch (May 2026)](https://techcrunch.com/2026/05/13/notion-just-turned-its-workspace-into-a-hub-for-ai-agents/)

[12] **Sourcegraph Cody**  
- Sourcegraph Blog: [Cody is Generally Available](https://sourcegraph.com/blog/cody-is-generally-available)
- Sourcegraph Blog: [How Cody Understands Your Codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase)
- Sourcegraph Docs: [Cody Documentation](https://sourcegraph.com/docs/cody)

[13] **Cursor Codebase Indexing**  
- Cursor Docs: [Codebase Indexing](https://cursor.com/docs/context/codebase-indexing)
- Cursor Blog: [How Cursor Indexes Codebases Fast](https://cursor.com/blog/secure-codebase-indexing)
- Engineer's Codex: [How Cursor Actually Indexes Your Codebase](https://read.engineerscodex.com/p/how-cursor-indexes-your-codebase)

[14] **Tree-Sitter & AST-Aware Code Chunking**  
- arXiv (2506.15655): [cAST: Enhancing Code RAG with Structural Chunking](https://arxiv.org/html/2506.15655v1)
- SuperMemory Blog: [AST-Aware Code Chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
- Medium (VXRL): [LLM Code Generation with RAG and AST Chunking](https://vxrl.medium.com/enhancing-llm-code-generation-with-rag-and-ast-based-chunking-5b81902ae9fc)

---

## 9. Unresolved Questions

1. **Is pgvector HNSW tuning (M, ef_construction) empirically documented for code RAG?** Most benchmarks test generic text; code chunking + search patterns may differ. [Needs: production case study with tree-sitter chunks in pgvector]

2. **Does Contextual Retrieval (Anthropic) work with code snippets, or only prose?** Paper tests on text docs; code structure (functions, class signatures) may not benefit from 50–100 token context preamble. [Needs: benchmark on code corpus]

3. **Zep's temporal KG is research-only as of Jan 2026. Production maturity timeline?** Temporal facts are novel; no reported deployed instances at scale. [Needs: Q2–Q3 2026 follow-up]

4. **Does RRF maintain gains across domains (code vs docs vs API schemas)?** Most RRF testing is on general text. Code queries (exact identifiers) may not benefit from rank fusion. [Needs: comparative evaluation on code corpus]

5. **mem0 v.s. Letta on cross-agent memory sharing—can two agents safely read/write same memory store?** Both claim support, but transaction semantics undefined. [Needs: documentation clarification from maintainers]

6. **How does tree-sitter chunking scale across 100+ languages in bb's multi-language projects?** Tree-sitter supports ~90 languages, but practical adoption fragmented. [Needs: pilot on real polyglot project]

7. **Should bb v3 expose memory operations (add/edit/delete) to agents as tools, or keep memory internal?** Self-editing memory (Letta) is novel; unclear if agents should be trusted with memory CRUD. [Needs: safety analysis + production patterns]

8. **What is the actual adoption rate of llms.txt in production (vs marketing)? Is it index-engine search (Google, Bing, Perplexity) or IDE-only?** Oct 2025 survey says no major crawler support, but data is anecdotal. [Needs: search engine transparency]

---

**Report compiled:** 2026-05-18  
**Research methodology:** Web search (primary sources prioritized), vendor docs, production benchmarks, arXiv papers  
**Confidence levels:** High (Anthropic, mem0, Zep, Graph RAG — all vendor or peer-reviewed sources); Medium (embedding model rankings — volatile, MTEB is continuous); Low (Letta production penetration — sparse public data)
