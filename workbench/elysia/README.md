# Workflows with ElysiaJS (Nitro v3)

- Learn more about ElysiaJS: https://elysiajs.com/
- Learn more about Nitro: https://v3.nitro.build/

## Commands

**Local development:**

```sh
npm run dev
```

**Production build (Vercel):**

```sh
NITRO_PRESET=vercel npm run build
npx vercel --prebuilt
```

**Production build (Bun):**

```sh
npm run build
bun run .output/server/index.mjs
```
