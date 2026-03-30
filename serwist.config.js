// @ts-check
import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

// A revision helps Serwist version a precached page.
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ?? crypto.randomUUID();

export default {
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  globDirectory: ".",
  injectionPoint: "self.__SW_MANIFEST",
  globIgnores: [
    ".next/server/pages/**/*.json",
    ".next/server/app/ignored.html",
    "node_modules/**/*",
    "app/**/*",
    "lib/**/*",
    "components/**/*",
    "hooks/**/*",
    "*.ts",
    "*.js"
  ],
  // Increase limit from default 2MB to 10MB to handle large chunks if they legitimately occur
  maximumFileSizeToCacheInBytes: 10485760,
};
