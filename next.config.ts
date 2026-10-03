import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.SCRAPBOOK_TEST_MODE ? ".next-e2e" : ".next",
};
export default config;
