# SplitMate

SplitMate is a personal and shared expense tracker built with React, TypeScript, Vite, Tailwind, and Capacitor.

It helps users:
- track personal income and expenses
- manage shared expenses with people and groups
- capture SMS transaction alerts and review them before moving to Personal, Split, or Group
- use mobile-first features such as native ads, backup hooks, and account-based customization

Current app version: 4.1.0

## Core Features

### Personal and Shared Tracking
- Personal tab with income and expense handling
- Split tab for person-based shared transactions
- Group tab flow for group expenses and participant splits

### SMS Transaction Workflow
- Dedicated SMS Transactions page
- Toggle-based SMS capture (on by default)
- Optional auto-approve to Personal
- Date-aware transaction cards with direction-aware amounts
- Counterparty extraction from SMS text (payer/payee)
- Payment app detection badge (for example UPI app or bank rails)
- Duplicate prevention for:
	- SMS queue ingestion
	- auto-approved entries in Personal

### UI and Account Experience
- Mobile-oriented card layouts and edit sheets
- Account quick access and profile support
- Optional ad-free behavior and native ad cards

## Tech Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Radix UI primitives
- Capacitor 8 (Android support included)
- Firebase and Supabase integrations (project-dependent usage)

## Project Structure

- src/components: UI components and tab screens
- src/components/tabs: primary tab pages including SMS Transactions
- src/lib/storage.ts: local storage models and persistence helpers
- src/plugins: native plugin wrappers (for example SMS capture)
- android: Capacitor Android project

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install Dependencies

1. Open a terminal in the project root.
2. Run:

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Mobile (Capacitor Android)

If you are working on Android:

1. Build web assets:

```bash
npm run build
```

2. Sync Capacitor project:

```bash
npx cap sync android
```

3. Open Android project:

```bash
npx cap open android
```

Then run from Android Studio.

## SMS Capture Notes

- SMS permission is requested during app launch/onboarding if SMS capture is enabled.
- On first enable, a local checkpoint timestamp is set to avoid importing historical SMS.
- New message processing uses timestamp checkpointing and duplicate signatures.
- Auto-approve path also checks existing Personal entries to prevent repeated inserts.

## Demo Data Behavior

SMS demo transactions are shown only for this account email:

- sandeshkullolli4@gmail.com

Demo rows are visible in the SMS Transactions list only and are dismissible by approve or discard actions.

## Scripts

- dev: start Vite dev server
- build: production build
- build:dev: development-mode build
- preview: preview built app
- lint: run ESLint
<<<<<<< HEAD
=======

>>>>>>> 8ca6ae36fb9f55c9fb59014f0a9370cdaa9c8942
