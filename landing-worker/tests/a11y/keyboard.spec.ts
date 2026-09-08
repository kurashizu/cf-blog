import { test, expect } from '@playwright/test';
import { returningVisitor, open, expectClean } from './helpers';

test.describe('keyboard journeys', () => {
	test.beforeEach(async ({ page }) => {
		await returningVisitor(page);
		await open(page, '/modules');
	});

	test('skip link is the first tab stop and lands on <main>', async ({ page }) => {
		await page.keyboard.press('Tab');
		const skip = page.locator('a.skip-link');
		await expect(skip).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('main#main')).toBeFocused();
	});

	test('landmarks: header nav, aside, main, footer', async ({ page }) => {
		await expect(page.getByRole('navigation')).toHaveCount(1);
		await expect(page.getByRole('complementary')).toHaveCount(1);
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(page.getByRole('contentinfo')).toHaveCount(1);
		await expect(page.getByRole('navigation').locator('button[aria-current="page"]')).toHaveCount(1);
	});

	test('view buttons rove with arrow keys and announce the switch', async ({ page }) => {
		const nav = page.getByRole('navigation');
		await nav.getByRole('button').first().focus();
		await page.keyboard.press('ArrowRight');
		await expect(nav.getByRole('button').nth(1)).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\/guestbook$/);
		await expect(page.locator('main#main')).toBeFocused();
		await expect(page.locator('[aria-live="polite"]')).toContainText(/guestbook/i);
	});

	test('settings dialog: focus in, trapped, Escape returns focus', async ({ page }) => {
		const cfg = page.getByRole('button', { name: /global config/i });
		await cfg.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog', { name: /global config/i });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator(':focus')).toHaveCount(1);
		await expect(page.locator('[data-app-root]')).toHaveAttribute('inert', '');
		// Tab many times: focus never leaves the dialog.
		for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
		await expect(dialog.locator(':focus')).toHaveCount(1);
		await expectClean(page, 'settings dialog');
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(cfg).toBeFocused();
		await expect(page.locator('[data-app-root]')).not.toHaveAttribute('inert', '');
	});

	test('accessibility switches persist', async ({ page }) => {
		await page.getByRole('button', { name: /global config/i }).click();
		const motion = page.getByRole('switch', { name: /reduce motion/i });
		await expect(motion).toHaveAttribute('aria-checked', 'false');
		await motion.click();
		await expect(motion).toHaveAttribute('aria-checked', 'true');
		await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
		const keys = page.getByRole('switch', { name: /single-key/i });
		await keys.click();
		await expect(keys).toHaveAttribute('aria-checked', 'false');
		await page.keyboard.press('Escape');
		// T no longer cycles the theme.
		const before = await page.locator('html').getAttribute('style');
		await page.keyboard.press('t');
		await page.waitForTimeout(200);
		expect(await page.locator('html').getAttribute('style')).toBe(before);
		await page.reload();
		await page.locator('main#main').waitFor();
		await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
	});

	test('language menu: arrows, typeahead, Escape returns focus', async ({ page }) => {
		const trigger = page.getByRole('button', { name: /language menu/i });
		await trigger.focus();
		await page.keyboard.press('Enter');
		const menu = page.getByRole('menu', { name: /language menu/i });
		await expect(menu).toBeVisible();
		await expect(menu.getByRole('menuitemradio', { checked: true })).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await expect(menu.getByRole('menuitemradio').nth(1)).toBeFocused();
		await page.keyboard.press('End');
		await expect(menu.getByRole('menuitemradio').last()).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});

	test('a knob is a slider that moves with the keyboard', async ({ page }) => {
		await open(page, '/synth');
		const slider = page.getByRole('slider').first();
		await slider.focus();
		const before = Number(await slider.getAttribute('aria-valuenow'));
		await page.keyboard.press('ArrowUp');
		const after = Number(await slider.getAttribute('aria-valuenow'));
		expect(after).toBeGreaterThan(before);
		await page.keyboard.press('Home');
		expect(await slider.getAttribute('aria-valuenow')).toBe(await slider.getAttribute('aria-valuemin'));
		await expect(slider).toHaveAttribute('aria-valuetext', /.+/);
	});
});
