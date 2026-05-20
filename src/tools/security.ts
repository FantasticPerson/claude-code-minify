import { FileSecurityConfig } from '../core/types.js'

export function checkFileSecurity(
  resolvedPath: string,
  workingDir: string,
  config?: FileSecurityConfig,
): string | null {
  const restrict = config?.restrictToProjectDir ?? false
  const blocked = config?.blockedPaths ?? []

  if (restrict && !resolvedPath.startsWith(workingDir)) {
    return `Error: 不允许访问项目目录外的路径: ${resolvedPath}`
  }

  for (const blockedPath of blocked) {
    if (resolvedPath.startsWith(blockedPath)) {
      return `Error: 不允许访问受限制路径: ${resolvedPath}`
    }
  }

  return null
}
