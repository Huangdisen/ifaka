import "./check.mjs";

import { copyFile, cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = "public";

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of ["index.html", "api-docs.html", "card-tool.html"]) {
  await copyFile(file, outputDirectory + "/" + file);
}

await cp("assets", outputDirectory + "/assets", { recursive: true });
await cp("docs", outputDirectory + "/docs", { recursive: true });
await copyFile(
  "docs/用户端API文档.md",
  outputDirectory + "/docs/user-api-v1.1.md"
);

process.stdout.write("Static site assembled in public/.\n");
