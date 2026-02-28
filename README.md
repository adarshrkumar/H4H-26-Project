# ATSDC Stack Application

This is the main Astro application for the ATSDC Stack.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Convex account (database + sync)
- API keys for Better Auth, OpenAI, and optionally Exa

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your .env file with your credentials
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Convex (database + sync)
PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"

# Better Auth Authentication
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:4321"

# OpenAI (for Vercel AI SDK)
OPENAI_API_KEY="sk-..."

# Exa Search (optional)
EXA_API_KEY="..."
```

### Convex Setup

```bash
# Start Convex dev server (run alongside astro dev)
npm run convex
```

### Development

```bash
# Start dev server
npm run dev
```

Visit `http://localhost:4321`

## 📝 Available Scripts

- `npm run dev` - Start development server
- `npm run convex` - Start Convex dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run astro` - Run Astro CLI commands

## 📁 Project Structure

```text
src/
├── components/         # Reusable Astro components
├── db/                 # Database client and types
│   ├── initialize.ts   # Convex client
│   └── schema.ts       # Type exports from Convex
├── layouts/            # Page layouts
│   └── Layout.astro
├── lib/                # Utility libraries
│   ├── config.ts       # App configuration
│   ├── content-converter.ts # Markdown/HTML conversion
│   ├── dom-utils.ts    # DOM manipulation
│   └── exa-search.ts   # AI-powered search
├── pages/              # Routes and pages
│   ├── api/            # API endpoints
│   │   ├── chat.ts     # AI chat endpoint
│   │   └── posts.ts    # Posts CRUD
│   └── index.astro     # Home page
└── styles/             # SCSS stylesheets
    ├── variables/      # SCSS variables and mixins
    ├── components/     # Component styles
    ├── pages/          # Page styles
    ├── reset.scss      # CSS reset
    └── global.scss     # Global styles
```

## 🎨 SCSS Architecture

This app uses a strict SCSS architecture:

- **No inline `<style>` tags** in `.astro` files
- **All styles in external SCSS files** for better maintainability
- **Data attributes for modifiers** (preferred over BEM)
- **Semantic class names** (no utility classes)

Example:

```astro
---
import '@/styles/components/button.scss';
---
<button class="btn" data-variant="primary" data-size="lg">
    Click Me
</button>
```

## 🗄️ Database

Database and real-time sync are handled by Convex. Define your schema in `convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    posts: defineTable({
        title: v.string(),
        content: v.string(),
    }),
});
```

Query and mutate data using Convex functions in the `convex/` directory. Types are auto-generated in `convex/_generated/`.

## 🔐 Authentication

Authentication is handled by Better Auth. Configure in `src/lib/auth.ts`:

```typescript
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
    // configuration
});
```

## 🤖 AI Features

### Vercel AI SDK

Chat endpoint example in `src/pages/api/chat.ts`:

```typescript
import { OpenAI } from 'ai';

export const POST: APIRoute = async ({ request }) => {
    // AI chat implementation
};
```

### Exa Search

AI-powered search utilities in `src/lib/exa-search.ts`.

## 📱 Progressive Web App

This app includes PWA support with offline capabilities:

- Service worker auto-generated
- Installable on mobile/desktop
- Offline caching configured in `astro.config.mjs`

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Make sure to set these environment variables in your Vercel project settings:

- `PUBLIC_CONVEX_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `OPENAI_API_KEY`
- `EXA_API_KEY` (optional)

## 📚 Documentation

- [Astro Documentation](https://docs.astro.build)
- [Convex](https://docs.convex.dev)
- [Better Auth](https://www.better-auth.com/docs)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Zod](https://zod.dev)
- [Exa Search](https://docs.exa.ai)

## 🛠️ Utilities

### Content Conversion

```typescript
import { htmlToMarkdown, markdownToHtml } from '@/lib/content-converter';

const markdown = htmlToMarkdown('<h1>Hello</h1>');
const html = markdownToHtml('# Hello');
```

### DOM Manipulation

```typescript
import { extractText, findLinks } from '@/lib/dom-utils';

const text = extractText(htmlString);
const links = findLinks(htmlString);
```

### AI Search

```typescript
import { searchWithExa } from '@/lib/exa-search';

const results = await searchWithExa('your query');
```

## 📄 License

MIT
