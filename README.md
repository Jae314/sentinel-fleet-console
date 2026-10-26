# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## File-fed console data

The typed JSON samples and Python integration notes are in [`public/data/README.md`](public/data/README.md). Set `VITE_DATA_SOURCE=mock`, `file`, or `hybrid` before building (default: `mock`). Hybrid reads the observed live host from files with five-second polling and retains the simulated fleet. Run `bun scripts/export-data.ts` to regenerate snapshots and the exported types. No endpoint operations are executed by the browser.
