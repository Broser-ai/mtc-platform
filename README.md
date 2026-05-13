# MTC Platform

**Master Team Console** — Universal AI orchestration platform.

Live at: https://mtc-platform-topaz.vercel.app

## Architecture

14-layer L0-L11 architecture covering:
- L1 Simple UI / Output Selector
- L2 Project Execution Contract
- L3 Universal Build Intelligence (UBI)
- L4 Artifact Intelligence Engine
- L5 AI Conductor (MTC-Bot)
- L6 Model Aggregator (8 patterns)
- L7 Gateway Layer (58 AI ecosystems)
- L8 MCP / Connector Layer (Horizon, Composio, n8n/Make/Zapier/Pipedream)
- L9 Agent Orchestration (94 departments, 134 masters)
- L10 QA / Approval / Security (4 risk classes)
- L11 Delivery / Memory / Watchers

## Stack

- **Frontend**: Next.js 15 + React 19 + Tailwind v4
- **Backend**: Supabase SSR + Postgres (project `tbuluvvqhrbgfcpoifjl`)
- **Auth**: Supabase magic link
- **LLM Gateway**: OpenRouter (default model `anthropic/claude-opus-4.6`)
- **External tools**: Composio (54 toolkits), Horizon (10 MCP templates)
- **Deployment**: Vercel (cron `*/15 * * * *` for watchers)

## Routes

- `/dashboard` — 6 stat cards + quick actions + recent executions
- `/architecture` — 14-layer health check
- `/browse/[type]` — catalog browser (departments/masters/skills/bundles/workflows/connectors)
- `/projects` — 4-step intake wizard
- `/chat` — MTC-Bot orchestrator
- `/executions` — run history
- `/settings` — account + integrations
- `/api/cron/watchers` — Vercel cron endpoint (15 min schedule)
- `/api/mtc-bot/chat` — bot planning + execution

## Environment Variables (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`

## Database Snapshot

- 94 departments across 10 tiers
- 134 masters with bios and authority
- 124 agent skills with SKILL.md body content
- 2,439 master_skills mappings
- 33 output bundles
- 19 workflows
- 58 AI ecosystems
- 54 Composio toolkits
- 10 Horizon templates
- 8 execution patterns
- 4 risk classes
