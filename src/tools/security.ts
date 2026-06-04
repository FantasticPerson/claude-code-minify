import { FileSecurityConfig } from '../core/types.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export async function checkFileSecurity(
  resolvedPath: string,
  workingDir: string,
  config?: FileSecurityConfig,
): Promise<string | null> {
  const restrict = config?.restrictToProjectDir ?? false
  const blocked = config?.blockedPaths ?? []

  if (restrict) {
    // Resolve symlinks to prevent path traversal
    let realWorkingDir = workingDir
    let realResolvedPath = resolvedPath
    try {
      realWorkingDir = await fs.realpath(workingDir)
      realResolvedPath = await fs.realpath(resolvedPath)
    } catch {
      // Path may not exist yet (e.g., file_write), fall back to string check
    }
    if (!realResolvedPath.startsWith(realWorkingDir + path.sep) && realResolvedPath !== realWorkingDir) {
      return `Error: 不允许访问项目目录外的路径: ${resolvedPath}`
    }
  }

  for (const blockedPath of blocked) {
    if (resolvedPath === blockedPath || resolvedPath.startsWith(blockedPath + path.sep)) {
      return `Error: 不允许访问受限制路径: ${resolvedPath}`
    }
  }

  return null
}
