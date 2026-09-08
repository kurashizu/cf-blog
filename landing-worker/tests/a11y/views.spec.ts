import { test } from '@playwright/test';
import { VIEWS, VIEWPORTS, returningVisitor, open, expectClean } from './helpers';

for (const [name, size] of Object.entries(VIEWPORTS)) {
	test.describe(`axe @ ${name}`, () => {
		test.use({ viewport: size });
		for (const view of VIEWS) {
			test(`${view}`, async ({ page }) => {
				await returningVisitor(page);
				await open(page, view);
				await expectClean(page, `${view} ${name}`);
			});
		}
	});
}
