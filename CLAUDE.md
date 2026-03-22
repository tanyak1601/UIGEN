# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Setup**: `npm run setup` (installs deps, generates Prisma client, runs migrations)
- **Dev server**: `npm run dev` (Next.js with Turbopack on port 3000)
- **Build**: `npm run build`
- **Lint**: `npm run lint` (Next.js ESLint config)
- **Run all tests**: `npm test`
- **Run single test**: `npx vitest path/to/test.test.tsx`
- **Reset database**: `npm run db:reset`
- **Prisma generate**: `npx prisma generate` (after schema changes)
- **Prisma migrate**: `npx prisma migrate dev` (after schema changes)

## Architecture

UIGen is a Next.js 15 App Router application where users describe React components via chat, and Claude AI generates them with a live in-browser preview. It uses the Vercel AI SDK for streaming AI responses with tool calls.

### Core Data Flow

1. User sends a message in the chat panel (`ChatContext` using `@ai-sdk/react` `useChat`)
2. `POST /api/chat` streams a response from Claude (`claude-haiku-4-5`) via `streamText()`
3. Claude calls tools (`str_replace_editor` for create/edit/view, `file_manager` for rename/delete) to manipulate a virtual file system
4. `FileSystemContext` processes tool call results and updates the in-memory `VirtualFileSystem`
5. JSX files are transformed via `@babel/standalone`, dependencies resolved via `esm.sh` CDN import maps, and the result rendered in a sandboxed iframe

### Key Contexts

- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`): Wraps `useChat` from AI SDK, manages conversation state and project persistence
- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`): Manages the virtual file system, handles AI tool call results, triggers preview updates

### AI Tools (called by the model, not the user)

- **`str_replace_editor`** (`src/lib/tools/str-replace.ts`): view, create, str_replace, insert operations on virtual files
- **`file_manager`** (`src/lib/tools/file-manager.ts`): rename, delete virtual files

### Preview Pipeline

`src/lib/transform/jsx-transformer.ts` handles the full pipeline: Babel JSX transform → blob URL generation → import map creation → preview HTML assembly. The entry point is always `/App.jsx` in the virtual FS. Third-party imports resolve to `esm.sh`.

### Auth & Persistence

- JWT sessions via `jose` library stored in httpOnly cookies (`src/lib/auth.ts`)
- Server Actions in `src/actions/` handle auth (signUp/signIn/signOut) and project CRUD
- Prisma with SQLite (`prisma/schema.prisma`): `User` and `Project` models. Projects store messages and file system state as JSON strings.
- Anonymous users can work without signing up; their work is tracked in sessionStorage and migrated on sign-up

### Provider Fallback

When `ANTHROPIC_API_KEY` is not set, `src/lib/provider.ts` returns a `MockLanguageModel` that produces static component code instead of calling Claude.

## Project Layout

- `src/app/` — Next.js pages and API routes (two routes: `/` and `/[projectId]`)
- `src/components/ui/` — shadcn/ui components (new-york style)
- `src/components/{chat,editor,preview,auth}/` — feature-grouped components
- `src/lib/` — core logic (auth, virtual FS, AI tools, prompts, JSX transform, contexts)
- `src/actions/` — Next.js Server Actions
- `prisma/` — schema and SQLite migrations

## Conventions

- Path alias: `@/*` maps to `src/*`
- Tests live in `__tests__/` directories next to their source files
- Tests use Vitest with `@testing-library/react`, jsdom environment
- Client components use `"use client"` directive
- Tailwind CSS v4 with CSS-based configuration in `globals.css`
