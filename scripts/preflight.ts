import { join } from "node:path"

/**
 * makes sure a build starts from exactly what is on origin
 *
 * eas, local or remote, builds the committed tree and github workflows build
 * what was pushed, so uncommitted or unpushed work silently never ships;
 * whatever can be healed safely is offered, everything else stops the run
 *
 * shared by every script that builds, keep it free of side effects on import
 */

const root = join(import.meta.dir, "..")

/**
 * run git in the repository
 *
 * @param args git arguments
 *
 * @returns trimmed stdout, or null when git fails
 */
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
  return result.success ? new TextDecoder().decode(result.stdout).trim() : null
}

/**
 * run git with its output shown, stopping the run when it fails
 *
 * @param args git arguments
 */
const gitVisible = (...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "inherit", stderr: "inherit" })
  if (!result.success) stop(`git ${args.join(" ")} failed.`)
}

/**
 * stop the run with a readable message instead of a stack trace
 *
 * @param message what went wrong and how to fix it
 */
const stop = (message: string): never => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/**
 * ask a yes or no question, yes by default
 *
 * PREFLIGHT_YES=1 answers yes for non-interactive runs, without a terminal the
 * answer is no so nothing is pushed unattended
 *
 * @param question question to ask
 *
 * @returns true when the answer is yes
 */
const confirm = (question: string) => {
  if (process.env.PREFLIGHT_YES === "1") {
    console.log(`${question} yes (PREFLIGHT_YES=1)`)
    return true
  }

  if (!process.stdin.isTTY) return false

  const answer = (prompt(`${question} [Y/n]`) ?? "").trim().toLowerCase()
  return answer === "" || answer === "y" || answer === "yes"
}

/**
 * make sure the branch is committed and in step with origin before a build
 *
 * @returns the current branch
 */
export const ensureSynced = (): string => {
  const branch =
    git("branch", "--show-current") || stop("Cannot build from a detached HEAD. Check out a branch first.")

  // ci checks out exactly the pushed commit
  if (process.env.CI) return branch

  // uncommitted work never reaches a build, so it has to be dealt with by hand
  const status = git("status", "--porcelain") ?? stop("Could not read the git status.")
  if (status) {
    stop(
      "The working tree has uncommitted changes, and builds only see what is committed.\n" +
        `Commit or stash them, then run this again:\n\n${status}`
    )
  }

  console.log(`Checking ${branch} against origin...`)
  if (git("fetch", "--quiet", "origin") === null)
    stop("Could not reach origin. Check your connection and try again.")

  const remote = `origin/${branch}`

  // first push of this branch
  if (git("rev-parse", "--verify", "--quiet", `refs/remotes/${remote}`) === null) {
    if (!confirm(`${branch} is not on origin yet. Push it?`))
      stop(`Push ${branch} to origin, then run this again.`)

    gitVisible("push", "--set-upstream", "origin", branch)
    return branch
  }

  const counts =
    git("rev-list", "--left-right", "--count", `${remote}...HEAD`) ?? stop("Could not compare with origin.")
  const [behind = 0, ahead = 0] = counts.split(/\s+/).map(Number)

  if (behind > 0 && ahead > 0) {
    stop(
      `${branch} and ${remote} have diverged (${ahead} local, ${behind} remote commit(s)).\n` +
        `Rebase onto origin with \`git pull --rebase\`, check the result, then run this again.`
    )
  }

  // safe to heal, the tree is clean and nothing local is lost
  if (behind > 0) {
    console.log(git("log", "--oneline", `HEAD..${remote}`) ?? "")
    if (!confirm(`${branch} is ${behind} commit(s) behind ${remote}. Fast-forward it?`)) {
      stop(`Update ${branch} from origin, then run this again.`)
    }

    gitVisible("merge", "--ff-only", remote)
  }

  if (ahead > 0) {
    console.log(git("log", "--oneline", `${remote}..HEAD`) ?? "")
    if (!confirm(`${ahead} commit(s) on ${branch} are not on origin yet. Push them?`)) {
      stop(`Push ${branch} to origin, then run this again.`)
    }

    gitVisible("push", "origin", branch)
  }

  console.log(`${branch} is committed and in step with origin.`)
  return branch
}
