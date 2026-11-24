import { expect, test } from '@playwright/test'

test('navigates a large dependency graph without scrolling or resizing the page', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto('/topics/cdc/dependencies')
  await expect(page.getByRole('heading', { name: 'Dependency graph' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'playbook.topics.v1'
    const workspace = JSON.parse(localStorage.getItem(key)!)
    const timestamp = '2026-11-24T12:00:00.000Z'
    const ids = ['upstream-a', 'upstream-b', 'upstream-c', ...Array.from({ length: 28 }, (_, index) => 'branch-' + index)]
    workspace.topics.push(...ids.map(id => ({
      id, title: id, type: 'General', description: '', content: '', createdAt: timestamp, updatedAt: timestamp,
    })))
    const endpoints = [['cdc', 'upstream-a'], ['upstream-a', 'upstream-b'], ['upstream-b', 'upstream-c'],
      ...ids.slice(3).map(id => [id, 'cdc'])]
    workspace.relationships = endpoints.map(([sourceTopicId, targetTopicId], index) => ({
      id: 'test-graph-' + index, sourceTopicId, targetTopicId, type: 'dependency', createdAt: timestamp, updatedAt: timestamp,
    }))
    localStorage.setItem(key, JSON.stringify(workspace))
  })
  await page.reload()
  const viewport = page.getByRole('region', { name: 'Dependency graph viewport' })
  const metrics = () => viewport.evaluate(element => ({
    x: element.scrollLeft, y: element.scrollTop, width: element.clientWidth, height: element.clientHeight,
    fullWidth: element.scrollWidth, fullHeight: element.scrollHeight,
  }))
  await expect(viewport.getByRole('link')).toHaveCount(31)
  expect((await metrics()).fullWidth).toBeGreaterThan((await metrics()).width)
  expect((await metrics()).fullHeight).toBeGreaterThan((await metrics()).height)
  await viewport.evaluate(element => element.scrollTo(0, 0))
  const box = (await viewport.boundingBox())!
  await page.mouse.move(box.x + 90, box.y + 20)
  await page.mouse.wheel(110, 140)
  await expect.poll(async () => (await metrics()).y).toBeGreaterThan(0)
  expect((await metrics()).x).toBeGreaterThan(0)
  await viewport.evaluate(element => element.scrollTo(0, 0))
  await page.mouse.move(box.x + 90, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, box.y + 8, { steps: 4 })
  await page.mouse.up()
  expect((await metrics()).x).toBeGreaterThan(0)
  expect((await metrics()).y).toBeGreaterThan(0)
  const level = page.getByLabel('Zoom level')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(level).toHaveText('125%')
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(level).toHaveText('100%')
  const originalHeight = (await metrics()).height
  await page.getByRole('button', { name: 'Expand graph' }).click()
  expect((await metrics()).height).toBeGreaterThan(originalHeight)
  await page.getByRole('button', { name: 'Fit to view' }).click()
  const fitted = await metrics()
  expect(fitted.fullWidth).toBe(fitted.width)
  expect(fitted.fullHeight).toBe(fitted.height)
  await page.getByRole('button', { name: 'Reset zoom' }).click()
  await expect(level).toHaveText('100%')
  await page.getByRole('button', { name: 'Restore graph size' }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('separator', { name: 'Resize Topics sidebar' }).press('ArrowRight')
  await page.getByRole('button', { name: 'Unpin Topics sidebar' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(level).toHaveText('125%')
  await expect(page.getByRole('button', { name: 'Expand graph' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect(viewport.getByRole('link')).toHaveCount(31)
})
