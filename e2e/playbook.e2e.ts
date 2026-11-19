import { expect, test, type Page } from '@playwright/test'

const storageKey = 'playbook.topics.v1'

function sectionLinks(page: Page) {
  return page.getByRole('navigation', { name: 'Topic sections' })
}

async function openTab(page: Page, name: string) {
  await sectionLinks(page).getByRole('link', { name, exact: true }).click()
}

async function saveVersion(page: Page, summary: string) {
  await page.getByRole('button', { name: 'Create version' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create version' })
  await dialog.getByLabel('Change summary').fill(summary)
  await dialog.getByRole('button', { name: 'Create version' }).click()
  await expect(dialog).toBeHidden()
}

async function addTask(page: Page, title: string, status: 'Done' | 'To do') {
  await page.getByRole('button', { name: 'Add task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Task title').fill(title)
  await dialog.getByLabel('Task status').selectOption({ label: status })
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog).toBeHidden()
}

test('edits and restores linked knowledge across all six tabs', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('complementary', { name: 'Topic browser' }).getByRole('link', { name: 'New', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('CDC integration')
  await page.getByLabel('Description', { exact: true }).fill('Preserve transaction order.')
  await page.getByLabel('Context Markdown').fill('## Standards\n\nKeep durable offsets.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('heading', { name: 'CDC integration' })).toBeVisible()
  await openTab(page, 'Dependencies')
  await page.getByRole('button', { name: 'Add relationship' }).click()
  const relationship = page.getByRole('dialog', { name: 'Add relationship' })
  await relationship.getByRole('searchbox').fill('Kafka')
  await relationship.getByRole('button', { name: 'Apache Kafka' }).click()
  await relationship.getByLabel('Description (optional)').fill('Publish changes to Kafka.')
  await relationship.getByRole('button', { name: 'Add relationship' }).click()
  await expect(page.getByRole('table')).toContainText('Publish changes to Kafka.')

  await openTab(page, 'Implementation')
  const project = page.getByRole('combobox', { name: 'Project', exact: true })
  await expect(project).toHaveValue('')
  await page.getByRole('button', { name: 'New project' }).click()
  const createProject = page.getByRole('dialog', { name: 'New project' })
  await createProject.getByLabel('Project name').fill('CDC rollout')
  await createProject.getByLabel('Description').fill('Original project description.')
  await createProject.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Implementation plan' })).toBeVisible()
  await addTask(page, 'Configure connector', 'Done')
  await addTask(page, 'Verify offsets', 'To do')
  const grip = page.getByRole('button', { name: 'Reorder Verify offsets' })
  await grip.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.implementation-task-row[data-dragging]')).toContainText('Verify offsets')
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.implementation-task-row[data-drop-edge="before"]')).toContainText('Configure connector')
  await page.keyboard.press('Space')
  await expect(page.locator('.task-title')).toHaveText(['Verify offsets', 'Configure connector'])
  await page.getByRole('button', { name: 'Add criterion' }).click()
  const criterion = page.getByRole('dialog', { name: 'Add criterion' })
  await criterion.getByLabel('Description').fill('Offsets survive restart')
  await criterion.getByRole('button', { name: 'Save criterion' }).click()
  await expect(page.getByRole('checkbox', { name: 'Offsets survive restart' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Tasks completed' })).toHaveAttribute('aria-valuenow', '50')
  const projectId = await project.inputValue()
  await project.selectOption({ label: 'Azure Data Platform' })
  await expect(page.getByText('No tasks yet.', { exact: false })).toBeVisible()
  await project.selectOption(projectId)
  await expect(page.locator('.task-title')).toHaveText(['Verify offsets', 'Configure connector'])
  expect(await page.evaluate(({ storageKey, projectId }) => {
    const { implementationData } = JSON.parse(localStorage.getItem(storageKey)!)
    return implementationData.implementations.filter((item: { projectId: string }) => item.projectId === projectId).length
  }, { storageKey, projectId })).toBe(1)

  await openTab(page, 'Agent Instructions')
  await page.getByRole('button', { name: 'Generate Instructions' }).click()
  const markdown = page.getByRole('textbox', { name: 'Instruction Markdown' })
  await expect(markdown).toHaveValue(/Keep durable offsets\.[\s\S]*Publish changes to Kafka\.[\s\S]*Original project description\./)
  const artifact = page.getByRole('combobox', { name: 'Preview artifact' })
  await artifact.selectOption({ label: 'PROMPT.md' })
  await expect(markdown).toHaveValue(/Implementation prompt[\s\S]*Verify offsets/)
  await artifact.selectOption({ label: 'CHECKLIST.md' })
  await expect(markdown).toHaveValue(/1\. \[ \] \*\*Verify offsets[\s\S]*Offsets survive restart[\s\S]*2\. \[x\] \*\*Configure connector/)
  for (const filename of ['AGENTS.md', 'PROMPT.md', 'CHECKLIST.md']) {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download ' + filename }).click()
    expect((await download).suggestedFilename()).toBe(filename)
  }
  await artifact.selectOption({ label: 'AGENTS.md' })
  await markdown.fill('# Keep this manual edit')
  await expect(page.getByText('Edited draft saved locally.')).toBeVisible()

  await openTab(page, 'Implementation')
  await page.getByRole('button', { name: 'Edit project' }).click()
  const editProject = page.getByRole('dialog', { name: 'Edit project' })
  await editProject.getByLabel('Description').fill('Updated project description.')
  await editProject.getByRole('button', { name: 'Save project' }).click()
  await expect(editProject).toBeHidden()
  await openTab(page, 'Agent Instructions')
  await expect(markdown).toHaveValue('# Keep this manual edit')
  await page.getByRole('button', { name: 'Regenerate' }).click()
  const regenerate = page.getByRole('dialog', { name: 'Replace manual edits?' })
  await regenerate.getByRole('button', { name: 'Keep edits' }).click()
  await expect(markdown).toHaveValue('# Keep this manual edit')
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await regenerate.getByRole('button', { name: 'Replace and regenerate' }).click()
  await expect(markdown).toHaveValue(/Updated project description\./)

  await openTab(page, 'Version History')
  await saveVersion(page, 'Before changing standards')
  await openTab(page, 'Content')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Context Markdown').fill('## Standards\n\nUse temporary offsets.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByText('Use temporary offsets.')).toBeVisible()
  await openTab(page, 'Dependencies')
  await page.getByRole('button', { name: /Remove .*Apache Kafka/ }).click()
  await expect(page.getByText('Relationship removed.')).toBeVisible()
  await openTab(page, 'Agent Instructions')
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(markdown).toHaveValue(/Use temporary offsets\./)
  await expect(markdown).not.toHaveValue(/Publish changes to Kafka/)

  await openTab(page, 'Version History')
  await saveVersion(page, 'Temporary standards')
  await page.getByRole('button', { name: 'Compare changes' }).click()
  await expect(page.locator('.version-comparison')).toContainText('Use temporary offsets.')
  await expect(page.locator('.version-comparison')).toContainText('Removed · Apache Kafka')

  await openTab(page, 'Content')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Context Markdown').fill('Unsubmitted content')
  await openTab(page, 'Version History')
  await page.getByRole('button', { name: 'View v1', exact: true }).click()
  await page.getByRole('button', { name: 'Restore selected version' }).click()
  const restore = page.getByRole('dialog', { name: 'Restore v1?' })
  await expect(restore).toContainText('discards unsaved changes')
  await restore.getByRole('button', { name: 'Restore version', exact: true }).click()
  await expect(page.locator('.version-timeline')).toContainText('State before restoring v1.')
  await openTab(page, 'Content')
  await expect(page.getByLabel('Context Markdown')).toHaveCount(0)
  await expect(page.getByText('Keep durable offsets.')).toBeVisible()
  await openTab(page, 'Dependencies')
  await expect(page.getByRole('table')).toContainText('Publish changes to Kafka.')

  await openTab(page, 'Metadata')
  await page.getByLabel('Category').fill('Data Patterns')
  await page.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByText('Metadata saved.')).toBeVisible()
  await openTab(page, 'Version History')
  await saveVersion(page, 'Classified CDC')
  await page.getByRole('button', { name: 'Compare changes' }).click()
  await expect(page.locator('.version-comparison')).toContainText('Data Patterns')
  await page.reload()
  await expect(page.locator('.version-timeline')).toContainText('Classified CDC')
  await openTab(page, 'Metadata')
  await expect(page.getByLabel('Category')).toHaveValue('Data Patterns')
  await expect(page.locator('.metadata-audit')).toContainText('v5')
  await openTab(page, 'Implementation')
  await expect(project).toHaveValue(projectId)
  await expect(page.locator('.task-title')).toHaveText(['Verify offsets', 'Configure connector'])
  await expect(page.getByRole('progressbar', { name: 'Tasks completed' })).toHaveAttribute('aria-valuenow', '50')
  await page.getByRole('complementary', { name: 'Topic browser' }).getByRole('link', { name: 'Apache Kafka' }).click()
  await expect(page.getByRole('heading', { name: 'Apache Kafka', exact: true })).toBeVisible()
  await openTab(page, 'Implementation')
  await expect(page.getByRole('heading', { name: 'Implementation plan' })).toHaveCount(0)
})

test('keeps the active route visible on mobile and returns focus when a keyboard dialog closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [slug, title] of [
    ['content', 'Content'], ['dependencies', 'Dependencies'], ['implementation', 'Implementation'],
    ['agent-instructions', 'Agent Instructions'], ['version-history', 'Version History'], ['metadata', 'Metadata'],
  ]) {
    await page.goto('/topics/cdc/' + slug)
    const active = sectionLinks(page).getByRole('link', { name: title, exact: true })
    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => active.evaluate(link => {
      const tab = link.getBoundingClientRect()
      const nav = link.parentElement!.getBoundingClientRect()
      return tab.left >= nav.left - 1 && tab.right <= nav.right + 1
    })).toBe(true)
  }
  await openTab(page, 'Version History')
  const create = page.getByRole('button', { name: 'Create version' })
  await create.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Create version' })
  await expect(dialog.getByLabel('Change summary')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(create).toBeFocused()
})

test('reports a failed local write and retains the unsaved input for retry', async ({ page }) => {
  await page.goto('/topics/cdc/metadata')
  await expect(page.getByLabel('Category')).toBeVisible()
  await page.evaluate(key => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        Storage.prototype.setItem = original
        throw new DOMException('Test quota', 'QuotaExceededError')
      }
      return original.call(this, name, value)
    }
  }, storageKey)
  await page.getByLabel('Category').fill('Retain this input')
  await page.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByRole('alert')).toContainText('could not save to browser storage')
  await expect(page.getByLabel('Category')).toHaveValue('Retain this input')
  await page.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByText('Metadata saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Category')).toHaveValue('Retain this input')
})

test('shows a recovery message without replacing invalid persisted data', async ({ page }) => {
  const invalid = '{invalid-workspace'
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  }, { key: storageKey, value: invalid })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('The original data has been preserved.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toContainText('The original data has been preserved.')
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(invalid)
})
