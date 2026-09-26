import tailwind from "bun-plugin-tailwind";
import { join, relative } from "node:path";

const outdir = join(import.meta.dir, "dist");
await Bun.$`rm -rf ${outdir}`.quiet();

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync({ cwd: import.meta.dir })];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const output of result.outputs) {
  console.log(` ${relative(import.meta.dir, output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
