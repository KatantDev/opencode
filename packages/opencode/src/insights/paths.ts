import path from "node:path"
import os from "node:os"
import { mkdir } from "node:fs/promises"

const xdgDataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")

export const root = () => path.join(xdgDataHome(), "opencode", "insights")
export const facetsDir = () => path.join(root(), "facets")
export const reportsDir = () => path.join(root(), "reports")
export const ensure = async (p: string) => {
  await mkdir(p, { recursive: true })
}

export * as InsightsPaths from "./paths"
