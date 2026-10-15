import fs from "node:fs"

const path = "ios/license_plist.yml"
let content = fs.readFileSync(path, "utf8")

content = content
  .replace("    file: '../node_modules/https-proxy-agent/LICENSE'", "    body: MIT")
  .replace("    file: '../node_modules/agent-base/LICENSE'", "    body: MIT")

fs.writeFileSync(path, content)
