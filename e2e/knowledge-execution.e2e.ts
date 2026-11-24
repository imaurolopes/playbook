import { expect, test, type Page } from '@playwright/test'

async function openProjectTopics(page: Page, project: string) {
  await page.goto(`/projects/${project}/topics`)
  return page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Change Data Capture (CDC)', exact: true }) })
}

test('keeps task editor controls visible while long criteria grow and the content scrolls', async ({ page }) => {
  await page.goto('/topics/cdc/implementation')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const add = page.getByRole('dialog', { name: 'Add task' })
  await expect.poll(async () => (await add.boundingBox())?.width).toBe(850)
  await add.getByLabel('Title').fill('Check snapshot')
  await add.getByRole('button', { name: 'Add criterion' }).click()
  const criterion = add.getByRole('textbox', { name: 'Criterion 1', exact: true })
  const initialHeight = (await criterion.boundingBox())!.height
  const longText = 'Verify that offsets remain consistent after a restart. '.repeat(40).trim() + '\nCheck the next offset.'
  await criterion.fill(longText)
  await expect.poll(async () => (await criterion.boundingBox())!.height).toBeGreaterThan(initialHeight)
  await add.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit task' })
  const text = edit.getByRole('textbox', { name: 'Criterion 1', exact: true })
  await expect(text).toHaveValue(longText)
  await page.setViewportSize({ width: 390, height: 620 })
  await expect.poll(async () => (await edit.boundingBox())?.width).toBe(362)
  const body = edit.locator('.implementation-dialog-body')
  const header = edit.getByRole('heading', { name: 'Edit task' })
  const footer = edit.getByRole('button', { name: 'Save' })
  const originalHeader = (await header.boundingBox())!.y
  const originalFooter = (await footer.boundingBox())!.y
  const scroll = await body.evaluate(element => {
    element.scrollTop = element.scrollHeight
    return { top: element.scrollTop, horizontalOverflow: element.scrollWidth > element.clientWidth }
  })
  expect(scroll.top).toBeGreaterThan(0)
  expect(scroll.horizontalOverflow).toBe(false)
  expect((await header.boundingBox())!.y).toBe(originalHeader)
  expect((await footer.boundingBox())!.y).toBe(originalFooter)
  await expect.poll(() => text.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  await edit.getByRole('button', { name: 'Remove criterion 1' }).click()
  await expect(text).toHaveCount(0)
  await footer.click()
  await expect(edit).toBeHidden()
})

test('defines topic tasks without a project and explicitly upgrades independent project execution', async ({ page }) => {
  await page.goto('/topics/cdc/implementation')
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const add = page.getByRole('dialog', { name: 'Add task' })
  await add.getByLabel('Title').fill('Design reusable CDC')
  await add.getByLabel('Implementation instructions').fill('Document source offsets.')
  await add.getByRole('button', { name: 'Add criterion' }).click()
  await add.getByLabel('Criterion 1', { exact: true }).fill('Offsets survive restart')
  await add.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Offsets survive restart', { exact: true })).toBeVisible()

  for (const project of ['azure-data-platform', 'aws-data-platform']) {
    const row = await openProjectTopics(page, project)
    await page.getByRole('combobox').selectOption('cdc')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(row).toContainText('Knowledge version 1')
    await row.getByRole('link', { name: 'Implementation' }).click()
    await expect(page.locator('.task-detail-title')).toHaveText('Design reusable CDC')
    if (project === 'azure-data-platform') {
      await page.getByRole('checkbox', { name: 'Offsets survive restart' }).check()
      await page.getByRole('button', { name: 'Mark as completed' }).click()
    } else {
      await expect(page.getByRole('checkbox', { name: 'Offsets survive restart' })).not.toBeChecked()
      await expect(page.getByRole('button', { name: 'Mark as completed' })).toBeVisible()
    }
  }

  await page.goto('/topics/cdc/implementation')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit task' })
  await edit.getByLabel('Title').fill('Revised CDC definition')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Revised CDC definition' })).toBeVisible()

  const row = await openProjectTopics(page, 'azure-data-platform')
  await row.getByRole('button', { name: 'Upgrade knowledge' }).click()
  await page.getByRole('dialog', { name: 'Upgrade knowledge?' }).getByRole('button', { name: 'Upgrade knowledge' }).click()
  await expect(row).toContainText('Knowledge version 2')
  await page.goto('/topics/cdc/implementation?project=azure-data-platform')
  await expect(page).toHaveURL(/\/topics\/cdc\/execution\?project=azure-data-platform$/)
  await expect(page.locator('.task-detail-title')).toHaveText('Design reusable CDC')
  await expect(page.getByRole('checkbox', { name: 'Offsets survive restart' })).toBeChecked()
  await expect(await openProjectTopics(page, 'aws-data-platform')).toContainText('Knowledge version 1')
})

test('selects and reorders Knowledge tasks without changing their dependencies', async ({ page }) => {
  await page.goto('/topics/cdc/implementation')
  await expect(page.getByRole('heading', { name: 'Checklist' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Topic sections' }).getByRole('link', { name: 'Implementation' })).toHaveAttribute('aria-current', 'page')
  const list = page.getByRole('list', { name: 'Implementation tasks' })
  const details = page.locator('#knowledge-task-details')
  for (const title of ['Read source', 'Verify offsets', 'Document rollout']) {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add task' })
    await dialog.getByLabel('Title').fill(title)
    if (title === 'Verify offsets') {
      await dialog.getByLabel('Implementation instructions').fill('Read **durable offsets**.')
      await dialog.getByRole('checkbox', { name: '1. Read source' }).check()
      await dialog.getByRole('button', { name: 'Add criterion' }).click()
      await dialog.getByPlaceholder('Describe a verifiable condition that demonstrates successful implementation.').fill('Offsets are available.')
    }
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
  }
  const verify = list.getByRole('button', { name: '2. Verify offsets', exact: true })
  const verifyRow = list.getByRole('listitem').filter({ has: page.getByRole('button', { name: '2. Verify offsets', exact: true }) })
  const background = await verifyRow.evaluate(row => getComputedStyle(row).backgroundColor)
  const position = { x: (await verify.boundingBox())!.width - 8, y: 10 }
  await verify.hover({ position })
  await expect(verifyRow).not.toHaveCSS('background-color', background)
  await verify.click({ position })
  await expect(verify).toHaveAttribute('aria-pressed', 'true')
  await expect(verifyRow).toHaveCSS('border-top-color', 'rgb(138, 91, 234)')
  await expect(details.locator('strong')).toHaveText('durable offsets')
  await details.getByLabel('About acceptance criteria').focus()
  await expect(details.getByRole('tooltip')).toHaveText('Conditions that must be satisfied for the task to be considered successfully implemented.')
  await expect(details.getByRole('checkbox')).toHaveCount(0)
  const criterion = details.getByRole('listitem').filter({ hasText: 'Offsets are available.' })
  await expect(criterion.locator('svg.lucide-square')).toHaveAttribute('aria-hidden', 'true')
  await details.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit task' })
  await edit.getByRole('textbox', { name: 'Criterion 1', exact: true }).fill('Offsets survive restart.')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(details.getByText('Offsets survive restart.')).toBeVisible()

  const readDefinitions = () => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('playbook.topics.v1')!)
    return data.taskDefinitions.map((task: Record<string, unknown>) => ({ ...task, order: undefined }))
  })
  const before = await readDefinitions()
  await expect(list.getByRole('button', { name: 'Move Read source up' })).toHaveCSS('cursor', 'default')
  await expect(list.getByRole('button', { name: 'Move Read source down' })).toHaveCSS('cursor', 'pointer')
  await expect(list.getByRole('button', { name: 'Move Document rollout down' })).toHaveCSS('cursor', 'default')
  async function dragReadSourceTo(title: string, edge: 'before' | 'after') {
    await list.scrollIntoViewIfNeeded()
    const grip = list.getByRole('button', { name: 'Reorder Read source' })
    await grip.hover()
    await expect(grip).toHaveCSS('cursor', 'grab')
    const drag = (await grip.boundingBox())!
    const target = (await list.getByRole('button', { name: `Reorder ${title}` }).boundingBox())!
    await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2)
    await page.mouse.down()
    await page.mouse.move(drag.x + drag.width / 2, target.y + target.height / 2, { steps: 12 })
    await expect(list.locator('[data-dragging="true"]')).toHaveCSS('background-color', 'rgb(59, 43, 95)')
    await expect(grip).toHaveCSS('cursor', 'grabbing')
    await expect(list.locator(`[data-drop-edge="${edge}"]`)).toHaveCount(1)
    await page.mouse.up()
  }
  await dragReadSourceTo('Document rollout', 'after')
  await expect(list.locator('.task-title')).toHaveText(['Verify offsets', 'Document rollout', 'Read source'])
  await expect(list.getByRole('button', { name: '1. Verify offsets', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(details.getByRole('button', { name: '3. Read source' })).toBeVisible()
  await dragReadSourceTo('Verify offsets', 'before')
  await expect(list.locator('.task-title')).toHaveText(['Read source', 'Verify offsets', 'Document rollout'])
  await expect(list.getByRole('button', { name: '2. Verify offsets', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await list.getByRole('button', { name: 'Move Verify offsets up' }).click()
  await expect(list.locator('.task-title')).toHaveText(['Verify offsets', 'Read source', 'Document rollout'])
  await list.getByRole('button', { name: 'Move Read source down' }).click()
  await expect(list.locator('.task-title')).toHaveText(['Verify offsets', 'Document rollout', 'Read source'])
  expect(await readDefinitions()).toEqual(before)
  await page.reload()
  await expect(list.locator('.task-title')).toHaveText(['Verify offsets', 'Document rollout', 'Read source'])
  await expect(details.getByRole('button', { name: '3. Read source' })).toBeVisible()
  await list.getByRole('button', { name: '2. Document rollout' }).click()
  await details.getByRole('button', { name: 'Delete task' }).click()
  await page.getByRole('dialog', { name: 'Delete task?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(list.locator('.task-title')).toHaveText(['Verify offsets', 'Read source'])
})
