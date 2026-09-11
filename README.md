# Cognitive Explorer

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/) [![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/) [![Supabase](https://img.shields.io/badge/Supabase-2-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

A React + TypeScript application with a browser-based explorer and an Electron desktop runtime. The project combines a Vite frontend with Monaco Editor, Supabase, Framer Motion, and packaging targets for Windows, macOS, and Linux.

## Stack

- React 18 + TypeScript
- Vite 5
- Electron 43
- Supabase JavaScript client
- Monaco Editor
- React Router
- TanStack React Query
- Framer Motion
- Tailwind CSS 3 + Radix UI
- Vitest + Testing Library

## Development

Install dependencies:

```bash
npm install
```

Start the development explorer:

```bash
npm run dev
```

Or launch the dedicated explorer web mode:

```bash
npm run dev:explorer:web
```

Build the web application:

```bash
npm run build
```

Run tests and linting:

```bash
npm test
npm run lint
```

## Desktop builds

The repository includes Electron packaging scripts for the three major desktop platforms:

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

## Status

The repository contains both web and desktop application infrastructure. Product-specific documentation will be expanded as the experience and feature set stabilize.

## Author

**Ravel Momo** — [@Notho-freedom](https://github.com/Notho-freedom)
