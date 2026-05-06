-- ============================================================
-- MTC-Bot Proof Schema — minimal tables for end-to-end test
-- ============================================================

-- Profiles (mirrors auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "users see own profile" on public.profiles
  for all using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- AI Ecosystems (seeded with 3 for proof)
create table if not exists public.ai_ecosystems (
  id text primary key,
  name text not null,
  openrouter_model_string text not null,
  display_color text default '#6B7280',
  role text,
  display_order int default 0
);

insert into public.ai_ecosystems (id, name, openrouter_model_string, display_color, role, display_order) values
('anthropic-claude', 'Anthropic / Claude Opus', 'anthropic/claude-opus-4', '#D97706', 'reasoning, strategy, synthesis, regulated content', 1),
('openai-gpt', 'OpenAI / GPT-4o', 'openai/gpt-4o', '#10A37F', 'general intelligence, creative, structured output', 2),
('google-gemini', 'Google / Gemini 2.5 Pro', 'google/gemini-2.5-pro-preview', '#4285F4', 'research, long context, multimodal analysis', 3)
on conflict (id) do nothing;

-- Departments (3 for proof)
create table if not exists public.departments (
  id text primary key,
  tier int not null,
  tier_name text,
  name text not null,
  description text,
  is_calibrated boolean default false,
  display_order int default 0
);

insert into public.departments (id, tier, tier_name, name, description, is_calibrated, display_order) values
('strategy', 1, 'Founders & Strategy', 'Strategy & Partnerships', 'Strategic planning, market analysis, partnership architecture, M&A advisory, competitive intelligence', true, 1),
('marketing', 3, 'Revenue Engines', 'Marketing', 'Brand, content strategy, SEO, performance marketing, social, PR, marketing analytics', true, 2),
('logistics', 4, 'Build & Deliver', 'Logistics, Supply Chain & Trade', 'Logistics strategy, warehouse ops, transport, customs & trade, inventory, last mile — Genven core dept', true, 3)
on conflict (id) do nothing;

-- Masters (3-5 per department for proof)
create table if not exists public.masters (
  id text primary key,
  department_id text references public.departments(id) on delete cascade,
  name text not null,
  affiliation text,
  authority text,
  bio text,
  default_gateway text references public.ai_ecosystems(id),
  display_order int default 0
);

insert into public.masters (id, department_id, name, affiliation, authority, bio, default_gateway, display_order) values
-- Strategy dept
('strategy-porter', 'strategy', 'Michael Porter', 'Harvard Business School', 'Competitive strategy, Five Forces, value chain analysis', 'Creator of the Five Forces framework and value chain concept. Defines competitive advantage as the ability to deliver superior value through cost leadership or differentiation. Specializes in industry structure analysis and sustainable competitive positioning.', 'anthropic-claude', 1),
('strategy-rumelt', 'strategy', 'Richard Rumelt', 'UCLA Anderson School', 'Good Strategy/Bad Strategy, kernel theory, strategic coherence', 'Author of Good Strategy/Bad Strategy. Argues that real strategy identifies the critical challenge and concentrates resources on it — not goals lists. Expert at diagnosing strategic incoherence and building coordinated action.', 'anthropic-claude', 2),
('strategy-christensen', 'strategy', 'Clayton Christensen', 'Harvard Business School', 'Disruptive innovation, jobs-to-be-done, innovator''s dilemma', 'Father of disruptive innovation theory. The Innovator''s Dilemma explains why great companies fail. Jobs-to-be-done framework reframes competition around what customers are trying to accomplish, not product categories.', 'openai-gpt', 3),
-- Marketing dept
('marketing-godin', 'marketing', 'Seth Godin', 'Akimbo / altMBA', 'Permission marketing, tribes, purple cow, remarkable products', 'Coined permission marketing and the purple cow concept. Argues marketing is no longer about interrupting strangers but earning attention through remarkable work. Expert in building tribes and spreading ideas that matter.', 'openai-gpt', 1),
('marketing-neumeier', 'marketing', 'Marty Neumeier', 'Liquid Agency', 'Brand gap, zag strategy, brand differentiation', 'Author of The Brand Gap and Zag. Defines brand as a person''s gut feeling about a product, company, or person. Specializes in the gap between business strategy and customer experience — and how design bridges it.', 'anthropic-claude', 2),
('marketing-avinash', 'marketing', 'Avinash Kaushik', 'Google / Market Motive', 'Digital analytics, See-Think-Do-Care framework, data storytelling', 'Google''s Digital Marketing Evangelist. Created the See-Think-Do-Care intent framework. Expert in transforming raw analytics data into actionable business decisions, and in building measurement frameworks that connect marketing to revenue.', 'google-gemini', 3),
-- Logistics dept
('logistics-shapiro', 'logistics', 'Roy Shapiro', 'Harvard Business School', 'Supply chain strategy, inventory optimization, demand planning', 'Harvard professor specializing in supply chain management and operations strategy. Expert in inventory theory, demand variability, and the trade-offs between service level and cost in complex supply networks.', 'anthropic-claude', 1),
('logistics-lee', 'logistics', 'Hau Lee', 'Stanford Graduate School of Business', 'Supply chain resilience, triple-A supply chains, bullwhip effect', 'Stanford professor who coined the Triple-A Supply Chain (Agile, Adaptable, Aligned). Documented the bullwhip effect. Research focus on supply chain resilience, global sourcing, and demand-supply coordination in volatile markets.', 'google-gemini', 2),
('logistics-christopher', 'logistics', 'Martin Christopher', 'Cranfield School of Management', 'Logistics strategy, demand-driven supply chains, time-based competition', 'Emeritus Professor at Cranfield. Author of Logistics & Supply Chain Management. Expert in demand-driven supply chains, agile logistics, and the intersection of marketing and supply chain strategy for competitive advantage.', 'openai-gpt', 3)
on conflict (id) do nothing;

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  project_type text default 'general',
  current_phase text,
  phase_metadata jsonb default '{}',
  status text default 'active',
  created_at timestamptz default now()
);

alter table public.projects enable row level security;
create policy "users manage own projects" on public.projects
  for all using (auth.uid() = user_id);

-- Executions (one per bot plan execution)
create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id),
  brief text not null,
  task_type text,
  pattern_id text default 'synthesis_after_parallel',
  squad_master_ids text[] default '{}',
  gateway_assignments jsonb default '{}',
  status text default 'pending',
  plan jsonb,
  results jsonb default '[]',
  synthesis_output text,
  total_tokens int default 0,
  total_cost_usd numeric(10,6) default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.executions enable row level security;
create policy "users see own executions" on public.executions
  for all using (auth.uid() = user_id);

-- Audit Log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  execution_id uuid references public.executions(id) on delete cascade,
  timestamp timestamptz default now(),
  phase text not null,
  model text,
  master_id text,
  prompt_tokens int default 0,
  completion_tokens int default 0,
  cost_usd numeric(10,6) default 0,
  latency_ms int,
  status text default 'ok',
  details jsonb default '{}'
);

alter table public.audit_log enable row level security;
create policy "users see own audit" on public.audit_log
  for all using (auth.uid() = user_id);

-- Bot Conversations
create table if not exists public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  messages jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bot_conversations enable row level security;
create policy "users manage own conversations" on public.bot_conversations
  for all using (auth.uid() = user_id);
