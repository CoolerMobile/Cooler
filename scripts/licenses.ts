import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const configPath = join(root, "ios", "license_plist.yml")
const nodeModulesPath = join(root, "node_modules")

const packageNameFromLicensePath = (licensePath: string) => {
  const parts = licensePath.split("/")
  const nodeModulesIndex = parts.lastIndexOf("node_modules")
  const firstPart = parts[nodeModulesIndex + 1]

  if (!firstPart) {
    throw new Error(`Cannot determine package name from license path: ${licensePath}`)
  }

  return firstPart.startsWith("@") ? `${firstPart}/${parts[nodeModulesIndex + 2]}` : firstPart
}

const packageLicense = (packageName: string) => {
  const packagePath = join(nodeModulesPath, packageName)
  const packageJsonPath = join(packagePath, "package.json")

  // Platform-specific packages for another OS are intentionally absent. Their
  // references can only be evaluated on the EAS worker that installs them.
  if (!existsSync(packageJsonPath)) {
    return undefined
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    license?: string | { type?: string }
  }
  const license = typeof packageJson.license === "string" ? packageJson.license : packageJson.license?.type

  if (license) {
    return license
  }

  for (const filename of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md"]) {
    const candidate = join(packagePath, filename)

    if (existsSync(candidate)) {
      return `|\n${readFileSync(candidate, "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n")}`
    }
  }

  throw new Error(`Cannot find license metadata for ${packageName}`)
}

let repaired = 0
const content = readFileSync(configPath, "utf8").replace(
  /^(\s*)file: '([^']+)'$/gm,
  (line, indentation: string, relativePath: string) => {
    const license = packageLicense(packageNameFromLicensePath(relativePath))

    if (!license) {
      return line
    }

    repaired += 1
    return `${indentation}body: ${license}`
  }
)

writeFileSync(configPath, content)
console.log(`Inlined ${repaired} license reference${repaired === 1 ? "" : "s"}.`)
