import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultRepositoryRoot = path.resolve(scriptDirectory, '..')

const releaseCopies = [
  {
    source: 'marketing/store/01-reading-1280x800.png',
    release: 'store/assets/screenshots/01-x-toc-1280x800.png',
  },
  {
    source: 'marketing/store/02-bookmarks-1280x800.png',
    release: 'store/assets/screenshots/02-bookmarks-1280x800.png',
  },
  {
    source: 'marketing/store/03-export-1280x800.png',
    release: 'store/assets/screenshots/03-export-1280x800.png',
  },
  {
    source: 'marketing/store/small-440x280.png',
    release: 'store/assets/promo/small-440x280.png',
  },
  {
    source: 'marketing/store/marquee-1400x560.png',
    release: 'store/assets/promo/marquee-1400x560.png',
  },
  {
    source: 'src/icons/logo-128.png',
    release: 'store/assets/icon/icon-128.png',
  },
]

function repositoryRootFromArguments(arguments_) {
  const rootIndex = arguments_.indexOf('--root')

  if (rootIndex === -1) {
    return defaultRepositoryRoot
  }

  const root = arguments_[rootIndex + 1]
  if (!root) {
    throw new Error('Expected a path after --root')
  }

  return path.resolve(root)
}

function localReleaseReferences(releaseDefinition) {
  const references = new Set()

  for (const line of releaseDefinition.split(/\r?\n/u)) {
    const valueMatch = line.match(/^\s*(?:-\s+|[A-Za-z][\w]*:\s+)(.+?)\s*$/u)
    if (!valueMatch) {
      continue
    }

    const value = valueMatch[1].replace(/^(['"])(.*)\1$/u, '$2')
    if (/\.(?:jpe?g|png|txt|webp)$/iu.test(value)) {
      references.add(value)
    }
  }

  return references
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

async function checkStoreAssets(repositoryRoot) {
  const failures = []
  const storeRoot = path.join(repositoryRoot, 'store')
  const releaseDefinitionPath = path.join(storeRoot, 'release.yml')
  const releaseDefinition = await readFile(releaseDefinitionPath, 'utf8')
  const references = localReleaseReferences(releaseDefinition)

  for (const reference of references) {
    const referencedPath = path.resolve(storeRoot, reference)
    const relativePath = path.relative(storeRoot, referencedPath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      failures.push(`Release reference escapes store/: ${reference}`)
      continue
    }

    try {
      const fileStats = await stat(referencedPath)
      if (!fileStats.isFile()) {
        failures.push(`Release reference is not a file: store/${reference}`)
      }
    } catch {
      failures.push(`Missing release file: store/${reference}`)
    }
  }

  const uploadFiles = [
    ...await listFiles(path.join(storeRoot, 'assets')),
    ...await listFiles(path.join(storeRoot, 'listing')),
  ]

  for (const uploadFile of uploadFiles) {
    const relativePath = path.relative(storeRoot, uploadFile).split(path.sep).join('/')
    if (!references.has(relativePath)) {
      failures.push(`Unreferenced release file: store/${relativePath}`)
    }
  }

  for (const copy of releaseCopies) {
    const releaseRelativePath = copy.release.replace(/^store\//u, '')
    if (!references.has(releaseRelativePath)) {
      failures.push(`Expected store/release.yml to reference ${copy.release}`)
      continue
    }

    try {
      const [sourceContent, releaseContent] = await Promise.all([
        readFile(path.join(repositoryRoot, copy.source)),
        readFile(path.join(repositoryRoot, copy.release)),
      ])

      if (!sourceContent.equals(releaseContent)) {
        failures.push(`Release copy differs from source: ${copy.release} != ${copy.source}`)
      }
    } catch (error) {
      failures.push(`Unable to compare ${copy.release} with ${copy.source}: ${error.message}`)
    }
  }

  return { failures, referenceCount: references.size, copyCount: releaseCopies.length }
}

async function main() {
  const repositoryRoot = repositoryRootFromArguments(process.argv.slice(2))
  const result = await checkStoreAssets(repositoryRoot)

  if (result.failures.length > 0) {
    console.error('Store asset check failed:')
    for (const failure of result.failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `Store asset check passed: ${result.referenceCount} release files, ${result.copyCount} source copies verified.`,
  )
}

main().catch((error) => {
  console.error(`Store asset check failed: ${error.message}`)
  process.exitCode = 1
})
